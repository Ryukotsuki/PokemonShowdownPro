const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function fixture(t,platform='win32',arch='x64') {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pro-replace-'));t.after(()=>{require('node:assert/strict').equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));return fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const stage=path.join(directory,'profile/app-update-staging/update-fixture');await fs.mkdir(stage,{recursive:true});
 const target=path.join(directory,platform==='darwin'?'Pokemon Showdown Pro.app':'portable'),source=path.join(stage,'unpacked');
 const writePackage=async(root,version)=>{
  const prefix=platform==='darwin'?path.join(root,'Contents'):root;
  const resources=path.join(prefix,platform==='darwin'?'Resources':'resources','app');
  await fs.mkdir(path.join(resources,'app'),{recursive:true});await fs.mkdir(path.join(resources,'build/update-runtime'),{recursive:true});
  await fs.writeFile(path.join(resources,'package.json'),JSON.stringify({name:'pokemon-showdown-pro',version}));
  await fs.writeFile(path.join(resources,'app/main.cjs'),version);await fs.writeFile(path.join(resources,'build/update-runtime',platform==='win32'?'node.exe':'node'),'fixture runtime');
  const binary=Buffer.alloc(4096);let executable;
  if(platform==='win32'){binary.write('MZ');binary.writeUInt32LE(128,60);binary.writeUInt32LE(0x00004550,128);binary.writeUInt16LE(arch==='x64'?0x8664:0xaa64,132);executable=path.join(root,'Pokemon Showdown Pro.exe');}
  else if(platform==='linux'){binary.set([0x7f,0x45,0x4c,0x46]);binary.writeUInt16LE(arch==='x64'?62:183,18);executable=path.join(root,'pokemon-showdown-pro.bin');await fs.writeFile(path.join(root,'pokemon-showdown-pro'),'#!/bin/sh\n');}
  else{binary.writeUInt32LE(0xfeedfacf);binary.writeUInt32LE(arch==='x64'?0x1000007:0x100000c,4);await fs.mkdir(path.join(prefix,'MacOS'));executable=path.join(prefix,'MacOS/Pokemon Showdown Pro');}
  await fs.writeFile(executable,binary);return executable;
 };
 const execPath=await writePackage(target,'1.1.2');await writePackage(source,'1.1.3');
 const job={stage,target,source,platform,arch,version:'1.1.3',execPath,packageHash:await require('../app/app-update-install.cjs').packageHash(source)};
 return {directory,stage,job,writePackage,package:root=>path.join(root,platform==='darwin'?'Contents/Resources/app/package.json':'resources/app/package.json')};
}
async function zipFixture(root,file) {
 const records=[];let offset=0;
 const walk=async(directory,prefix='')=>{
  for(const item of await fs.readdir(directory,{withFileTypes:true})) {
   const name=prefix+item.name;if(item.isDirectory()){await walk(path.join(directory,item.name),name+'/');continue;}
   const data=await fs.readFile(path.join(directory,item.name)),encoded=Buffer.from(name),crc=require('node:zlib').crc32(data);
   const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(encoded.length,26);
   const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(encoded.length,28);central.writeUInt32LE(offset,42);
   records.push({local:Buffer.concat([local,encoded,data]),central:Buffer.concat([central,encoded])});offset+=30+encoded.length+data.length;
  }
 };
 await walk(root);const directory=Buffer.concat(records.map(item=>item.central)),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(records.length,8);end.writeUInt16LE(records.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 await fs.writeFile(file,Buffer.concat([...records.map(item=>item.local),directory,end]));
}
module.exports={fixture,zipFixture};
