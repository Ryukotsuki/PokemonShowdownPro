const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const yaml=require('js-yaml');
// Use the builder's real block-map algorithm without its multi-write console
// logger, which can corrupt Node's test-worker output protocol on Windows.
const {buildBlockMap}=require('app-builder-lib/out/targets/blockmap/blockmap');
const appendBlockmap=file=>buildBlockMap(file,'deflate');
const {GenericProvider}=require('electron-updater/out/providers/GenericProvider');
const {prepareAppImage,runtimeInfo,digest,updateInformation}=require('../scripts/appimage-release.cjs');
const {linuxRequirements,glibcVersions}=require('../scripts/verify-appimage.cjs');
function runtime(dynamic=false) {
 const bytes=Buffer.alloc(4096);bytes.write('\x7fELF');bytes[4]=2;bytes[5]=1;
 bytes.writeBigUInt64LE(64n,32);bytes.writeUInt16LE(56,54);bytes.writeUInt16LE(dynamic?1:0,56);
 if(dynamic)bytes.writeUInt32LE(3,64);
 bytes.writeBigUInt64LE(256n,40);bytes.writeUInt16LE(64,58);bytes.writeUInt16LE(3,60);bytes.writeUInt16LE(1,62);
 const names=Buffer.from('\0.shstrtab\0.upd_info\0');names.copy(bytes,512);
 bytes.writeUInt32LE(1,320);bytes.writeBigUInt64LE(512n,344);bytes.writeBigUInt64LE(BigInt(names.length),352);
 bytes.writeUInt32LE(11,384);bytes.writeBigUInt64LE(1024n,408);bytes.writeBigUInt64LE(1024n,416);
 return bytes;
}
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pro-appimage-test-'));
 t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));return fs.rm(root,{recursive:true,force:true});});
 const dist=path.join(root,'dist');await fs.mkdir(dist);
 const name='PokemonShowdownPro-1.1.6-x86_64.AppImage',image=path.join(dist,name),manifest=path.join(dist,'latest-linux.yml');
 const payload=Buffer.alloc(65536,42);await fs.writeFile(image,Buffer.concat([runtime(),payload]));
 const originalInfo=await appendBlockmap(image);
 const metadata={version:'1.1.6',path:name,sha512:originalInfo.sha512,files:[{url:name,...originalInfo}]};
 await fs.writeFile(manifest,yaml.dump(metadata));
 const run=async(command,args)=>{
  assert.equal(command,'zsyncmake');
  const url='https://github.com/Ryukotsuki/PokemonShowdownPro/releases/download/v1.1.6/'+name;
  assert.deepEqual(args.slice(0,2),['-u',url]);assert.deepEqual(args.slice(4,6),['-f',name]);assert.equal(args.at(-1),image);
  await fs.writeFile(args[3],`zsync: 0.6.2\nFilename: ${name}\nURL: ${url}\nLength: ${(await fs.stat(image)).size}\nSHA-1: ${await digest(image,'sha1')}\n\nfixture block checksums`);
 };
 return {root,dist,name,image,manifest,metadata,originalInfo,payload,run};
}
test('AppImage metadata is embedded without changing the payload, and native Pro metadata is regenerated for older clients',async t=>{
 const f=await fixture(t);const result=await prepareAppImage({root:f.root,run:f.run,appendBlockmap});
 const bytes=await fs.readFile(f.image),metadata=yaml.load(await fs.readFile(f.manifest,'utf8'));
 assert.equal(bytes.subarray(1024,2048).toString().split('\0')[0],updateInformation('x86_64'));
 assert.deepEqual(bytes.subarray(4096,4096+f.payload.length),f.payload);
 assert.notEqual(metadata.sha512,f.originalInfo.sha512);
 assert.equal(metadata.sha512,await digest(f.image,'sha512','base64'));assert.equal(metadata.path,f.name);
 const provider=new GenericProvider({url:'https://example.com/'},{isAddNoCacheQuery:false},{platform:'linux',executor:{}});
 provider.httpRequest=async()=>yaml.dump(metadata);
 const file=provider.resolveFiles(await provider.getLatestVersion())[0];
 assert.equal(file.url.pathname,'/'+f.name);assert.equal(file.info.sha512,metadata.sha512);
 const blockSize=bytes.readUInt32BE(bytes.length-4);assert.equal(blockSize,file.info.blockMapSize);
 const blockMap=JSON.parse(zlib.inflateRawSync(bytes.subarray(bytes.length-4-blockSize,bytes.length-4)));
 assert.equal(blockMap.files[0].sizes.reduce((sum,size)=>sum+size,0),bytes.length-4-blockSize);
 assert.ok((await fs.stat(result.control)).size>0);
});
test('dynamic runtimes and altered packages fail before the release metadata can be rewritten',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.manifest);
 const bytes=await fs.readFile(f.image);runtime(true).copy(bytes,0);await fs.writeFile(f.image,bytes);
 await assert.rejects(prepareAppImage({root:f.root,run:f.run,appendBlockmap}),/static runtime/);
 assert.deepEqual(await fs.readFile(f.manifest),before);
 runtime().copy(bytes,0);bytes[4096]=99;await fs.writeFile(f.image,bytes);
 await assert.rejects(prepareAppImage({root:f.root,run:f.run,appendBlockmap}),/original update metadata/);
 assert.deepEqual(await fs.readFile(f.manifest),before);
});
test('incorrect zsync checksums cannot publish metadata for the final AppImage',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.manifest);
 await assert.rejects(prepareAppImage({root:f.root,appendBlockmap,run:async(command,args)=>{
  await f.run(command,args);const file=args[3];await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace(/SHA-1: [a-f0-9]+/,'SHA-1: '+'0'.repeat(40)));
 }}),/zsync does not describe/);
 assert.deepEqual(await fs.readFile(f.manifest),before);
});
test('ELF table bounds are checked and payload strings do not determine runtime linkage',()=>{
 const bytes=runtime();bytes.write('GLIBC_999.0',2500);assert.equal(runtimeInfo(bytes).static,true);
 assert.equal(runtimeInfo(runtime(true)).static,false);
 bytes.writeBigUInt64LE(9999999n,40);assert.throws(()=>runtimeInfo(bytes),/Invalid AppImage ELF table/);
});
test('Linux requirements report the highest required glibc version from every ELF binary and ignore definitions or GLIBCXX',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pro-glibc-test-'));
 t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));return fs.rm(root,{recursive:true,force:true});});
 await fs.writeFile(path.join(root,'electron'),runtime());await fs.writeFile(path.join(root,'node'),runtime());await fs.writeFile(path.join(root,'script'),'GLIBC_999.0');
 assert.deepEqual(glibcVersions('Name: GLIBC_2.28\nName: GLIBCXX_3.4\nGLIBC_999.0'),['2.28']);
 const result=await linuxRequirements(root,{run:async(command,args,{onOutput})=>{
  assert.equal(command,'readelf');const version=path.basename(args.at(-1))==='node'?'2.28':'2.34';
  onOutput("Version definition section '.gnu.version_d' contains 1 entry:\nName: GLIBC_999.0\nVersion needs section '.gnu.version_r' contains 3 entries:\nName: GLI");
  onOutput('BC_'+version+'\nName: GLIBC_2.9\nName: GLIBCXX_3.4\n');
 }});
 assert.equal(result.glibc,'2.34');assert.equal(result.binaries.length,2);
 assert.equal(result.binaries.find(item=>item.file==='node').glibc,'2.28');
});
