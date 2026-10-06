const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {verifySignature,verifyMacPackages}=require('../scripts/verify-macos-package.cjs');

async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pro-mac-package-test-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const dist=path.join(root,'dist'),bundle=path.join(dist,'mac-arm64/Pokemon Showdown Pro.app');
 const seal=path.join(bundle,'Contents/_CodeSignature/CodeResources');
 await fs.mkdir(path.dirname(seal),{recursive:true});await fs.writeFile(seal,'fixture resource seal');
 await fs.mkdir(path.join(bundle,'Contents/Resources/app/build/update-runtime'),{recursive:true});
 await fs.writeFile(path.join(bundle,'Contents/Resources/app/build/update-runtime/node'),'fixture node');
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({version:'1.1.4'}));
 for(const ext of ['dmg','zip'])await fs.writeFile(path.join(dist,'PokemonShowdownPro-1.1.4-macos-arm64.'+ext),'fixture archive');
 const calls=[];let mount;
 const run=async(command,args)=>{
  calls.push([command,args]);
  if(command.endsWith('/hdiutil')&&args[0]==='attach'){mount=args[args.indexOf('-mountpoint')+1];await fs.cp(bundle,path.join(mount,path.basename(bundle)),{recursive:true});}
  if(command.endsWith('/hdiutil')&&args[0]==='detach'){assert.equal(args[1],mount);}
  if(command.endsWith('/ditto'))await fs.cp(bundle,path.join(args.at(-1),path.basename(bundle)),{recursive:true});
 };
 return {root,bundle,seal,calls,run};
}
test('macOS verification rejects a bundle with a missing resource seal before attempting to launch it',async t=>{
 const f=await fixture(t);await fs.unlink(f.seal);
 await assert.rejects(verifySignature(f.bundle,{run:f.run}),{code:'ENOENT'});
 assert.equal(f.calls.length,0);
});
test('both release download formats and their bundled update runtimes undergo strict native signature checks',async t=>{
 const f=await fixture(t);await verifyMacPackages({root:f.root,arch:'arm64',run:f.run});
 const signatures=f.calls.filter(([command])=>command==='/usr/bin/codesign');
 assert.equal(signatures.length,6);
 const bundles=signatures.filter(([,args])=>args.includes('--deep'));
 assert.equal(bundles.length,3);assert.equal(bundles[0][1].at(-1),f.bundle);
 assert.ok(bundles[1][1].at(-1).includes(path.sep+'mounted'+path.sep));
 assert.ok(bundles[2][1].at(-1).includes(path.sep+'zip'+path.sep));
 for(const [,args]of signatures){assert.ok(args.includes('--verify'));assert.ok(args.includes('--strict'));}
 const scratch=path.dirname(path.dirname(bundles[1][1].at(-1)));await assert.rejects(fs.access(scratch));
});
test('a damaged ZIP signature fails verification and its extracted temporary files are cleaned',async t=>{
 const f=await fixture(t);let zipBundle;
 const run=async(command,args)=>{
  await f.run(command,args);
  if(command==='/usr/bin/codesign'&&args.includes('--deep')&&args.at(-1).includes(path.sep+'zip'+path.sep)){
   zipBundle=args.at(-1);throw new Error('a sealed resource is missing or invalid');
  }
 };
 await assert.rejects(verifyMacPackages({root:f.root,arch:'arm64',run}),/sealed resource/);
 assert.ok(zipBundle);await assert.rejects(fs.access(path.dirname(path.dirname(zipBundle))));
 await fs.access(f.bundle);
});
