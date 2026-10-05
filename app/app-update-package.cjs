const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),MAX_BYTES=1024*1024*1024,MAX_UNPACKED=3*MAX_BYTES;
const {validateZip}=require('./update-downloads.cjs');
const {validatePackage,installation,packageHash}=require('./app-update-install.cjs');

async function transfer(url,file,{fetch:fetcher=globalThis.fetch,signal,onProgress=()=>{}}={}) {
 const response=await fetcher(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10*60*1000)]):AbortSignal.timeout(10*60*1000)});
 if(!response.ok)throw Object.assign(new Error('Update download returned HTTP '+response.status),{statusCode:response.status});
 const total=Number(response.headers.get('content-length'))||0;
 if(total>MAX_BYTES)throw new Error('App update download is too large');
 const handle=await fs.open(file,'wx'),hash=crypto.createHash('sha256');let bytes=0;
 try {
  for await(const chunk of response.body) {
   signal?.throwIfAborted();bytes+=chunk.length;if(bytes>MAX_BYTES)throw new Error('App update download is too large');
   hash.update(chunk);await handle.writeFile(chunk);onProgress(total?Math.min(100,Math.floor(bytes/total*100)):null);
  }
  if(total&&bytes!==total)throw new Error('App update download was incomplete');
  await handle.sync();return hash.digest('hex');
 } finally {await handle.close();}
}
function checksum(text,name) {
 const line=text.trim().split(/\r?\n/);
 if(line.length!==1)throw new Error('Invalid app update checksum');
 const match=/^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line[0]);
 if(!match||match[2]!==name)throw new Error('Invalid app update checksum');
 return match[1].toLowerCase();
}
async function extractArchive(file,directory,platform) {
 await fs.mkdir(directory,{recursive:true});
 if(platform==='win32') {
  validateZip(await fs.readFile(file),MAX_UNPACKED);
  const {extract}=await import('@electron-internal/extract-zip');await extract(file,{dir:directory});
 } else if(platform==='linux') {
  const tar=require('tar');let total=0,unsafe;
  // Inspect the complete archive first; rejecting links also prevents extraction
  // through an archive-created symlink into files outside this staging folder.
  await tar.t({file,strict:true,onReadEntry:entry=>{
   const name=entry.path.replace(/^\.\//,'');
   if((name===''||name==='.')&&entry.type==='Directory')return;
   total+=entry.size||0;
   if(!name||path.posix.isAbsolute(name)||name.includes('\\')||name.split('/').includes('..')||!['File','Directory'].includes(entry.type)||total>MAX_UNPACKED)unsafe=new Error('Unsafe app update archive');
  }});
  if(unsafe)throw unsafe;
  await tar.x({file,cwd:directory,strict:true,preservePaths:false,noChown:true,chmod:true});
 } else if(platform==='darwin') {
  const mount=path.join(directory,'mounted');await fs.mkdir(mount);
  await execute('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',mount,file],{timeout:60000,windowsHide:true});
  try {
   const bundle=path.join(mount,'Pokemon Showdown Pro.app');
   await validateTree(bundle,true);
   await fs.cp(bundle,path.join(directory,'Pokemon Showdown Pro.app'),{recursive:true,verbatimSymlinks:true});
  } finally {await execute('/usr/bin/hdiutil',['detach',mount],{timeout:30000,windowsHide:true});}
 } else throw new Error('Unsupported app update platform');
}
async function validateTree(root,allowLinks=false) {
 const resolved=await fs.realpath(root);let bytes=0;
 const walk=async directory=>{
  for(const item of await fs.readdir(directory,{withFileTypes:true})) {
   const file=path.join(directory,item.name),info=await fs.lstat(file);
   if(info.isSymbolicLink()) {
    const target=await fs.realpath(file);
    if(!allowLinks||!target.startsWith(resolved+path.sep))throw new Error('Unsafe app update link');
   } else if(info.isDirectory())await walk(file);
   else if(info.isFile()){bytes+=info.size;if(bytes>MAX_UNPACKED)throw new Error('App update is too large');}
   else throw new Error('Unsafe app update file');
  }
 };
 await walk(root);
}
async function packageRoot(directory,platform) {
 if(platform==='darwin')return path.join(directory,'Pokemon Showdown Pro.app');
 const matches=async dir=>{try{await fs.access(path.join(dir,'resources/app/package.json'));return true;}catch{return false;}};
 if(await matches(directory))return directory;
 const candidates=[];
 for(const item of await fs.readdir(directory,{withFileTypes:true}))if(item.isDirectory()&&await matches(path.join(directory,item.name)))candidates.push(path.join(directory,item.name));
 if(candidates.length!==1)throw new Error('App update has an unexpected folder layout');
 return candidates[0];
}
async function prepareAppUpdate({app,root,platform,arch,execPath,download,signal,onProgress,fetch:fetcher,extract=extractArchive}) {
 const target=installation(execPath,platform);
 // Test parent/root access before downloading. No elevation or browser fallback.
 await fs.access(platform==='darwin'?path.dirname(target):target,fs.constants.W_OK);
 const base=path.join(app.getPath('userData'),'app-update-staging');await fs.mkdir(base,{recursive:true});
 const stage=await fs.mkdtemp(path.join(base,'update-'));
 try {
  const get=fetcher||((...args)=>require('electron').net.fetch(...args));
  const check=await get(download.checksumUrl,{signal:signal||AbortSignal.timeout(20000)});
  if(!check.ok)throw new Error('The release is missing its app update checksum');
  const checkText=await check.text();if(checkText.length>1024)throw new Error('Invalid app update checksum');
  const expected=checksum(checkText,download.name),archive=path.join(stage,download.name);
  const actual=await transfer(download.url,archive,{fetch:get,signal,onProgress});
  if(actual!==expected)throw new Error('App update checksum mismatch');
  signal?.throwIfAborted();onProgress?.(100);
  const unpacked=path.join(stage,'unpacked');await extract(archive,unpacked,platform);
  const source=await packageRoot(unpacked,platform);await validateTree(source,platform==='darwin');
  await validatePackage(source,{platform,arch,version:download.version});
  signal?.throwIfAborted();
  await fs.unlink(archive);
  // The old app's bundled Node and this helper live outside the install tree,
  // allowing Windows to release every executable/DLL before replacement.
  const node=path.join(stage,platform==='win32'?'node.exe':'node'),helper=path.join(stage,'install.cjs');
  await fs.copyFile(path.join(root,'build/update-runtime',platform==='win32'?'node.exe':'node'),node);
  if(platform!=='win32')await fs.chmod(node,0o755);
  await fs.copyFile(path.join(root,'app/app-update-install.cjs'),helper);
  const job={platform,arch,version:download.version,target,source,stage,parentPid:process.pid,execPath,packageHash:await packageHash(source)};
  await fs.writeFile(path.join(stage,'job.json'),JSON.stringify(job));
  return {stage,node,helper,job};
 } catch(error) {
  // Only the unique folder created above is removed; the installed app is untouched.
  if(path.dirname(stage)!==base)throw new Error('Invalid app update staging path');
  await fs.rm(stage,{recursive:true,force:true});throw error;
 }
}
module.exports={transfer,checksum,extractArchive,validateTree,packageRoot,prepareAppUpdate};
