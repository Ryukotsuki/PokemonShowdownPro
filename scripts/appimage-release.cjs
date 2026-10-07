const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const yaml=require('js-yaml');
const {runProcess}=require('../app/update-process.cjs');
const updateInformation=arch=>`gh-releases-zsync|Ryukotsuki|PokemonShowdownPro|latest|PokemonShowdownPro-*-${arch}.AppImage.zsync`;
// Read the ELF runtime only. Never search the compressed application payload
// for strings that could be mistaken for runtime dependencies or metadata.
function runtimeInfo(bytes) {
 if(bytes.length<64 || bytes.toString('hex',0,4)!=='7f454c46' || bytes[4]!==2 || bytes[5]!==1)throw new Error('Expected a 64-bit little-endian AppImage ELF runtime');
 const range=(offset,size)=>{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||offset+size>bytes.length)throw new Error('Invalid AppImage ELF table');};
 const programOffset=Number(bytes.readBigUInt64LE(32)),programSize=bytes.readUInt16LE(54),programCount=bytes.readUInt16LE(56);
 let dynamic=false;
 if(programCount && programSize<56)throw new Error('Invalid AppImage ELF program table');
 range(programOffset,programSize*programCount);
 for(let i=0;i<programCount;i++) {
  const record=programOffset+i*programSize,type=bytes.readUInt32LE(record);
  if(type===3)dynamic=true; // PT_INTERP: requires a system dynamic loader.
  if(type===2) {
   const offset=Number(bytes.readBigUInt64LE(record+8)),size=Number(bytes.readBigUInt64LE(record+32));range(offset,size);
   for(let p=offset;p+16<=offset+size;p+=16){const tag=bytes.readBigUInt64LE(p);if(tag===0n)break;if(tag===1n)dynamic=true;}
  }
 }
 const sectionOffset=Number(bytes.readBigUInt64LE(40)),sectionSize=bytes.readUInt16LE(58),sectionCount=bytes.readUInt16LE(60),nameIndex=bytes.readUInt16LE(62);
 if(!sectionCount || sectionSize<64 || nameIndex>=sectionCount)throw new Error('Missing AppImage ELF section table');
 range(sectionOffset,sectionSize*sectionCount);
 const namesRecord=sectionOffset+nameIndex*sectionSize,namesOffset=Number(bytes.readBigUInt64LE(namesRecord+24)),namesSize=Number(bytes.readBigUInt64LE(namesRecord+32));range(namesOffset,namesSize);
 let update;
 for(let i=0;i<sectionCount;i++) {
  const record=sectionOffset+i*sectionSize,nameOffset=bytes.readUInt32LE(record);
  if(nameOffset>=namesSize)throw new Error('Invalid AppImage ELF section name');
  const start=namesOffset+nameOffset,end=bytes.indexOf(0,start);
  if(end<start||end>=namesOffset+namesSize)throw new Error('Invalid AppImage ELF section name');
  if(bytes.toString('utf8',start,end)==='.upd_info') {
   update={offset:Number(bytes.readBigUInt64LE(record+24)),size:Number(bytes.readBigUInt64LE(record+32))};range(update.offset,update.size);
   if(update.size<1||update.size>4096)throw new Error('Invalid AppImage update information section');
  }
 }
 return {static:!dynamic,update};
}
async function readRuntime(file) {
 const handle=await fs.open(file,'r');
 try {
  const size=Math.min((await handle.stat()).size,16*1024*1024),bytes=Buffer.alloc(size);let offset=0;
  while(offset<size){const {bytesRead}=await handle.read(bytes,offset,size-offset,offset);if(!bytesRead)throw new Error('Incomplete AppImage ELF runtime');offset+=bytesRead;}
  return {bytes,info:runtimeInfo(bytes)};
 }
 finally {await handle.close();}
}
async function digest(file,algorithm,encoding='hex') {
 const hash=crypto.createHash(algorithm);for await(const bytes of require('node:fs').createReadStream(file))hash.update(bytes);return hash.digest(encoding);
}
function zsyncHeaders(bytes) {
 const separator=bytes.indexOf(Buffer.from('\n\n'));if(separator<0||separator>8192)throw new Error('Invalid AppImage zsync header');
 return Object.fromEntries(bytes.subarray(0,separator).toString().split('\n').map(line=>{const p=line.indexOf(':');return [line.slice(0,p),line.slice(p+1).trim()];}));
}
async function prepareAppImage({root=path.resolve(__dirname,'..'),run=runProcess,
 appendBlockmap=file=>require('app-builder-lib/out/targets/differentialUpdateInfoBuilder').appendBlockmap(file)}={}) {
 const dist=path.join(root,'dist'),manifest=path.join(dist,'latest-linux.yml');
 const metadata=yaml.load(await fs.readFile(manifest,'utf8'));
 const candidates=metadata.files?.filter(item=>item.url.endsWith('.AppImage'))||[];
 if(candidates.length!==1)throw new Error('Expected one Linux AppImage in update metadata');
 const item=candidates[0],match=/^PokemonShowdownPro-(\d+\.\d+\.\d+)-(x86_64|aarch64)\.AppImage$/.exec(item.url);
 if(!match||match[1]!==metadata.version)throw new Error('Unexpected AppImage filename or version');
 const image=path.join(dist,item.url),{info}=await readRuntime(image),information=updateInformation(match[2]);
 if(!info.static)throw new Error('AppImage must use the static runtime; check toolsets.appimage');
 if(!info.update||Buffer.byteLength(information)>=info.update.size)throw new Error('AppImage cannot embed update information');
 const size=(await fs.stat(image)).size;
 if(size!==item.size||await digest(image,'sha512','base64')!==item.sha512)throw new Error('AppImage does not match its original update metadata');
 if(!Number.isInteger(item.blockMapSize)||item.blockMapSize<=0||size-item.blockMapSize-4<=info.update.offset+info.update.size)throw new Error('Invalid AppImage embedded block map');
 const handle=await fs.open(image,'r+');
 try {
  const tail=Buffer.alloc(4);await handle.read(tail,0,4,size-4);
  if(tail.readUInt32BE()!==item.blockMapSize)throw new Error('AppImage block map size mismatch');
  // The metadata edit changes header bytes. Remove the old block map first,
  // then regenerate it and all hashes so existing Pro updaters remain valid.
  await handle.truncate(size-item.blockMapSize-4);
  const update=Buffer.alloc(info.update.size);update.write(information);await handle.write(update,0,update.length,info.update.offset);
 }finally{await handle.close();}
 const newInfo=await appendBlockmap(image);
 if(newInfo.size!==(await fs.stat(image)).size||newInfo.sha512!==await digest(image,'sha512','base64'))throw new Error('AppImage block map regeneration failed');
 const {info:updatedInfo,bytes:updatedBytes}=await readRuntime(image);
 if(!updatedInfo.static||updatedBytes.subarray(info.update.offset,info.update.offset+info.update.size).toString().split('\0')[0]!==information)throw new Error('AppImage update information verification failed');
 // Publish the zsync description of the FINAL bytes, including Pro's block map.
 const control=image+'.zsync',downloadUrl=`https://github.com/Ryukotsuki/PokemonShowdownPro/releases/download/v${metadata.version}/${item.url}`;
 // GitHub redirects asset downloads to another host. An absolute versioned URL
 // avoids resolving a relative AppImage URL against that temporary host.
 await run('zsyncmake',['-u',downloadUrl,'-o',control,'-f',item.url,image],{cwd:dist,timeout:120000});
 const headers=zsyncHeaders(await fs.readFile(control));
 if(headers.Filename!==item.url||headers.URL!==downloadUrl||Number(headers.Length)!==newInfo.size||headers['SHA-1']!==await digest(image,'sha1'))throw new Error('AppImage zsync does not describe the final package');
 Object.assign(item,newInfo);metadata.path=item.url;metadata.sha512=newInfo.sha512;
 if('size' in metadata)metadata.size=newInfo.size;
 if('blockMapSize' in metadata)metadata.blockMapSize=newInfo.blockMapSize;
 await fs.writeFile(manifest,yaml.dump(metadata));
 console.log(`AppImage ready: ${item.url}, static runtime, embedded AppImageUpdate information and verified zsync/Pro checksums.`);
 return {image,control,information};
}
if(require.main===module)prepareAppImage().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={prepareAppImage,runtimeInfo,readRuntime,digest,zsyncHeaders,updateInformation};
