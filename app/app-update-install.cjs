// Standalone helper copied alongside a bundled Node runtime before Pro quits.
// Keep this module dependency-free: replacing resources must not unload it.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function installation(execPath,platform) {
 if(platform==='darwin') {
  const match=/^(.*\.app)[\\/]Contents[\\/]MacOS[\\/][^\\/]+$/.exec(execPath);
  if(!match)throw new Error('Move Pro to Applications before updating it');
  if(/AppTranslocation|[\\/]Volumes[\\/]/.test(match[1]))throw new Error('Move Pro to Applications and reopen it before updating');
  return path.resolve(match[1]);
 }
 return path.dirname(path.resolve(execPath));
}
function managedName(name,platform) {
 if(platform==='win32')return /^(?:resources|locales|Pokemon Showdown Pro\.exe|LICENSE(?:S)?[^\\/]*|version|[\w-]+\.(?:dll|pak|dat|bin)|vk_swiftshader_icd\.json)$/.test(name);
 return /^(?:resources|locales|pokemon-showdown-pro(?:\.bin)?|chrome-sandbox|chrome_crashpad_handler|LICENSE(?:S)?[^\\/]*|version|[\w-]+\.(?:pak|dat|bin)|lib[\w.-]+\.so(?:\.\d+)*|vk_swiftshader_icd\.json)$/.test(name);
}
async function validatePackage(root,{platform,arch,version}) {
 const prefix=platform==='darwin'?path.join(root,'Contents'):root;
 const resources=path.join(prefix,platform==='darwin'?'Resources':'resources','app');
 const pkg=JSON.parse(await fs.readFile(path.join(resources,'package.json'),'utf8'));
 if(pkg.name!=='pokemon-showdown-pro'||pkg.version!==version)throw new Error('App update package version or identity does not match');
 const executable=platform==='darwin'?path.join(prefix,'MacOS/Pokemon Showdown Pro'):
  path.join(root,platform==='win32'?'Pokemon Showdown Pro.exe':'pokemon-showdown-pro.bin');
 const handle=await fs.open(executable,'r'),header=Buffer.alloc(4096);let length;
 try{({bytesRead:length}=await handle.read(header,0,header.length,0));}finally{await handle.close();}
 let machine;
 if(platform==='win32'&&header.toString('ascii',0,2)==='MZ') {
  const offset=header.readUInt32LE(60);
  if(offset+6<=length&&header.readUInt32LE(offset)===0x00004550)machine=header.readUInt16LE(offset+4);
  if(machine!==(arch==='x64'?0x8664:0xaa64))throw new Error('App update has the wrong Windows architecture');
 } else if(platform==='linux'&&header.toString('hex',0,4)==='7f454c46') {
  machine=header.readUInt16LE(18);
  if(machine!==(arch==='x64'?62:183))throw new Error('App update has the wrong Linux architecture');
 } else if(platform==='darwin'&&header.readUInt32LE(0)===0xfeedfacf) {
  machine=header.readUInt32LE(4);
  if(machine!==(arch==='x64'?0x1000007:0x100000c))throw new Error('App update has the wrong macOS architecture');
 } else throw new Error('App update executable is invalid');
 await fs.access(path.join(resources,'app/main.cjs'));
 await fs.access(path.join(resources,'build/update-runtime',platform==='win32'?'node.exe':'node'));
 if(platform!=='darwin') {
  for(const name of await fs.readdir(root))if(!managedName(name,platform))throw new Error('Unexpected file in app update: '+name);
 }
 return pkg;
}
async function waitForExit(pid,timeout=60000) {
 if(!Number.isSafeInteger(pid)||pid<1||pid===process.pid)throw new Error('Invalid updating process');
 const end=Date.now()+timeout;
 while(Date.now()<end) {
  try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')return;throw error;}
  await pause(150);
 }
 throw new Error('Pro is still running; update was not installed');
}
async function packageHash(root) {
 const hash=crypto.createHash('sha256');
 const walk=async(directory,prefix='')=>{
  for(const name of (await fs.readdir(directory)).sort()) {
   const file=path.join(directory,name),relative=prefix+name,info=await fs.lstat(file);
   hash.update(JSON.stringify([relative,info.mode&0o777]));
   if(info.isDirectory()){hash.update('directory');await walk(file,relative+'/');}
   else if(info.isSymbolicLink()){hash.update('link');hash.update(await fs.readlink(file));}
   else if(info.isFile()){hash.update('file');for await(const bytes of require('node:fs').createReadStream(file))hash.update(bytes);}
   else throw new Error('Unsafe staged app update file');
  }
 };
 await walk(root);return hash.digest('hex');
}
async function rename(from,to) {
 for(let attempt=0;attempt<50;attempt++) {
  try{return await fs.rename(from,to);}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt===49)throw error;await pause(200);}
 }
}
async function applyUpdate(job,{launch=(executable,args)=>launchApp(executable,args,{platform:job.platform,logFile:path.join(job.stage,'startup.log')}),confirm=waitForConfirmation,move=rename}={}) {
 const {target,source,platform,stage}=job;
 // Paths come from the staged job, but validate them again in the detached process.
 if(!['win32','linux','darwin'].includes(platform)||!path.isAbsolute(target)||!path.isAbsolute(stage)||!path.isAbsolute(source)||path.resolve(source)!==source||!source.startsWith(stage+path.sep)||installation(job.execPath,platform)!==target||(await fs.lstat(source)).isSymbolicLink())throw new Error('Invalid app update install paths');
 if(path.basename(stage).startsWith('update-')===false||path.basename(path.dirname(stage))!=='app-update-staging')throw new Error('Invalid app update stage');
 await validatePackage(source,job);
 if(!/^[a-f0-9]{64}$/.test(job.packageHash||'')||await packageHash(source)!==job.packageHash)throw new Error('Staged app update checksum mismatch');
 const targetResources=path.join(target,platform==='darwin'?'Contents/Resources/app/package.json':'resources/app/package.json');
 if(JSON.parse(await fs.readFile(targetResources,'utf8')).name!=='pokemon-showdown-pro')throw new Error('Installed app identity does not match');
 const token=crypto.randomBytes(16).toString('hex');job.token=token;
 const backup=platform==='darwin'?target+'.pro-backup-'+token:path.join(target,'.pro-backup-'+token);
 const incoming=platform==='darwin'?target+'.pro-incoming-'+token:path.join(backup,'incoming');
 const saved=[],added=[];let child;
 await fs.mkdir(platform==='darwin'?path.dirname(incoming):backup,{recursive:true});
 try {
  await fs.cp(source,incoming,{recursive:true,verbatimSymlinks:true});
  if(platform==='darwin') {
   await move(target,backup);saved.push('bundle');
   await move(incoming,target);added.push('bundle');
  } else {
   const files=await fs.readdir(incoming);
   for(const name of await fs.readdir(target))if(managedName(name,platform)) {
    await move(path.join(target,name),path.join(backup,name));saved.push(name);
   }
   for(const name of files){await move(path.join(incoming,name),path.join(target,name));added.push(name);}
  }
  await fs.writeFile(path.join(stage,'job.json'),JSON.stringify({...job,backup}));
  child=await launch(job.execPath,['--pro-update-confirm='+token]);
  await confirm(job,child);
  await fs.writeFile(path.join(stage,'result.json'),JSON.stringify({installed:true,version:job.version,backup}));
  // Keep the previous app as a backup. User data and unrelated portable files
  // were never moved; a later cleanup can remove this specifically named backup.
  return {backup};
 } catch(error) {
  if(child&&!child.killed){child.kill();try{await waitForExit(child.pid,10000);}catch{}}
  if(platform==='darwin') {
   if(added.length)await move(target,incoming);
   if(saved.length)await move(backup,target);
  } else {
   // Move the failed new files into the stage rather than deleting app paths.
   const failed=path.join(backup,'failed');await fs.mkdir(failed,{recursive:true});
   for(const name of added)await rename(path.join(target,name),path.join(failed,name));
   for(const name of saved)await rename(path.join(backup,name),path.join(target,name));
  }
  await fs.writeFile(path.join(stage,'result.json'),JSON.stringify({installed:false,message:error.message}));
  if(saved.length)await launch(job.execPath,[]);
  throw error;
 }
}
async function launchApp(executable,args,{platform=process.platform,logFile,spawnProcess=spawn}={}) {
 // The Linux wrapper supplies flags before Chromium starts. Launching .bin
 // directly bypasses it, including when restarting after a failed update.
 const command=platform==='linux'?path.join(path.dirname(executable),'pokemon-showdown-pro'):executable;
 const output=logFile?await fs.open(logFile,'a',0o600):null;
 try {return await new Promise((resolve,reject)=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawnProcess(command,args,{cwd:path.dirname(executable),env,detached:true,stdio:output?['ignore',output.fd,output.fd]:'ignore',windowsHide:true});
  child.once('error',reject);child.once('spawn',()=>{child.unref();resolve(child);});
 });}finally{await output?.close();}
}
async function waitForConfirmation(job,child) {
 const end=Date.now()+90000;
 while(Date.now()<end) {
  try{if(await fs.readFile(path.join(job.stage,'confirmed'),'utf8')===job.token)return;}catch{}
  if(child.exitCode!==null||child.signalCode)throw new Error('The updated app could not start'+(child.signalCode?' ('+child.signalCode+')':' (exit '+child.exitCode+')'));
  await pause(200);
 }
 throw new Error('The updated app did not confirm startup');
}
async function confirmAppUpdate(app,execPath=process.execPath,args=process.argv) {
 const token=args.find(arg=>arg.startsWith('--pro-update-confirm='))?.split('=')[1];
 if(!/^[a-f0-9]{32}$/.test(token||''))return;
 const base=path.join(app.getPath('userData'),'app-update-staging');
 for(const directory of await fs.readdir(base).catch(()=>[])) {
  if(!directory.startsWith('update-'))continue;
  const stage=path.join(base,directory);
  try {
   const job=JSON.parse(await fs.readFile(path.join(stage,'job.json'),'utf8'));
   // macOS /var and /private/var (and other installation aliases) can name
   // the same executable. Keep the identity check, using the actual file paths.
   if(job.token===token&&job.version===app.getVersion()&&await fs.realpath(job.execPath)===await fs.realpath(execPath))await fs.writeFile(path.join(stage,'confirmed'),token);
  }catch{}
 }
}
async function cleanupCompletedUpdates(app,execPath=process.execPath,platform=process.platform) {
 const base=path.join(app.getPath('userData'),'app-update-staging'),target=installation(execPath,platform),completed=[];
 for(const entry of await fs.readdir(base,{withFileTypes:true}).catch(()=>[])) {
  if(!entry.isDirectory()||!entry.name.startsWith('update-'))continue;
  const stage=path.join(base,entry.name);
  try {
   const job=JSON.parse(await fs.readFile(path.join(stage,'job.json'),'utf8')),result=JSON.parse(await fs.readFile(path.join(stage,'result.json'),'utf8'));
   const backup=platform==='darwin'?target+'.pro-backup-'+job.token:path.join(target,'.pro-backup-'+job.token);
   if(result.installed!==true||job.target!==target||job.platform!==platform||!/^\d+\.\d+\.\d+$/.test(job.version)||!/^[a-f0-9]{32}$/.test(job.token)||result.backup!==backup||(await fs.lstat(backup)).isSymbolicLink())continue;
   completed.push({stage,backup,version:job.version});
  }catch{}
 }
 completed.sort((a,b)=>{const av=a.version.split('.').map(Number),bv=b.version.split('.').map(Number);for(let i=0;i<3;i++)if(av[i]!==bv[i])return bv[i]-av[i];return 0;});
 for(const [index,item] of completed.entries()) {
  try {
   if(index>0) {
    // Each backup path was matched to this installation and the helper's token
    // above. Remove only old completed backups and their unique stage folders.
    await fs.rm(item.backup,{recursive:true,force:true});
    await fs.rm(item.stage,{recursive:true,force:true});
   } else {
    // Keep one previous version, but discard its now-unused downloaded payload.
    await fs.rm(path.join(item.stage,'unpacked'),{recursive:true,force:true});
    for(const name of ['node','node.exe','install.cjs','helper-ready'])await fs.rm(path.join(item.stage,name),{force:true});
   }
  }catch{} // Locked files can be cleaned on a later launch.
 }
}
async function runJob(file) {
 const job=JSON.parse(await fs.readFile(file,'utf8'));
 if(path.resolve(file)!==path.join(job.stage,'job.json'))throw new Error('Invalid app update job file');
 await validatePackage(job.source,job);
 await fs.writeFile(path.join(job.stage,'helper-ready'),'ready');
 await waitForExit(job.parentPid);await applyUpdate(job);
}
if(require.main===module)runJob(path.resolve(process.argv[2])).catch(async error=>{
 console.error(error);try{await fs.writeFile(path.join(path.dirname(process.argv[2]),'install-error.log'),error.stack);}catch{}process.exitCode=1;
});
module.exports={installation,managedName,validatePackage,packageHash,waitForExit,applyUpdate,launchApp,confirmAppUpdate,cleanupCompletedUpdates,runJob};
