const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {runProcess}=require('../app/update-process.cjs');

async function verifySignature(bundle,{run=runProcess}={}) {
 // A missing resource seal produced the v1.1.3 "damaged" error on downloaded
 // Macs, even though the same bundle launched in CI without quarantine.
 await fs.access(path.join(bundle,'Contents/_CodeSignature/CodeResources'));
 await run('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',bundle],{timeout:120000});
 const node=path.join(bundle,'Contents/Resources/app/build/update-runtime/node');
 await run('/usr/bin/codesign',['--verify','--strict','--verbose=2',node],{timeout:30000});
}
async function verifyMacPackages({root=path.resolve(__dirname,'..'),arch=process.arch,run=runProcess}={}) {
 if(!['arm64','x64'].includes(arch))throw new Error('Unsupported macOS package architecture');
 const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid release version');
 const dist=path.join(root,'dist'),product='Pokemon Showdown Pro.app';
 const bundle=path.join(dist,arch==='arm64'?'mac-arm64':'mac',product);
 const name=`PokemonShowdownPro-${version}-macos-${arch}`;
 const dmg=path.join(dist,name+'.dmg'),zip=path.join(dist,name+'.zip');
 await fs.access(dmg);await fs.access(zip);
 await verifySignature(bundle,{run});
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'pro-mac-signatures-'));
 const mount=path.join(scratch,'mounted'),extracted=path.join(scratch,'zip');let mounted=false;
 try {
  await fs.mkdir(mount);
  await run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',mount,dmg],{timeout:60000});mounted=true;
  await verifySignature(path.join(mount,product),{run});
  await run('/usr/bin/hdiutil',['detach',mount],{timeout:30000});mounted=false;
  // ditto preserves the macOS bundle layout, symlinks and resource filenames.
  await fs.mkdir(extracted);
  await run('/usr/bin/ditto',['-x','-k',zip,extracted],{timeout:120000});
  await verifySignature(path.join(extracted,product),{run});
 }finally{
  if(mounted)await run('/usr/bin/hdiutil',['detach',mount],{timeout:30000});
  assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));
  await fs.rm(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
 console.log('macOS resource signatures passed: unpacked app, DMG, ZIP and bundled Node.');
}
if(require.main===module)verifyMacPackages().catch(async error=>{
 console.error(error);process.exitCode=1;
 const directory=path.resolve(__dirname,'../test-results/package-verification-darwin-'+process.arch);
 await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'mac-signature.log'),error.stack+'\n');
});
module.exports={verifySignature,verifyMacPackages};
