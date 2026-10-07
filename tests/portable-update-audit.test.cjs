const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {sealFixtureBundle,runAuditStep}=require('../scripts/portable-update-audit.cjs');
test('edited macOS fixtures renew only the outer seal and still strictly verify nested signatures',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pro-audit-seal-'));
 t.after(()=>{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));return fs.rm(directory,{recursive:true,force:true});});
 const bundle=path.join(directory,'Pro.app'),seal=path.join(bundle,'Contents/_CodeSignature/CodeResources');
 await fs.mkdir(path.dirname(seal),{recursive:true});await fs.writeFile(seal,'fixture seal');
 const calls=[];
 await sealFixtureBundle(bundle,{run:async(command,args,options)=>{calls.push({command,args,options});}});
 assert.equal(calls.length,3);
 assert.deepEqual(calls[0].args,['--force','--sign','-','--timestamp=none','--preserve-metadata=entitlements,requirements,flags',bundle]);
 assert.equal(calls[0].options.timeout,120000);
 assert.deepEqual(calls[1].args,['--verify','--deep','--strict','--verbose=2',bundle]);
 assert.equal(calls[2].args.at(-1),path.join(bundle,'Contents/Resources/app/build/update-runtime/node'));
 assert.ok(calls.every(call=>call.command==='/usr/bin/codesign'));
 await assert.rejects(sealFixtureBundle(bundle,{run:async()=>{throw new Error('Invalid fixture signature');}}),/Invalid fixture signature/);
});
test('audit watchdog identifies the stalled phase instead of a generic whole-audit timeout',async()=>{
 const progress=[];
 await assert.rejects(runAuditStep('verify rollback',()=>new Promise(()=>{}),{timeout:20,onProgress:line=>progress.push(line)}),/timed out during verify rollback/);
 assert.deepEqual(progress,['verify rollback…']);
 const value=await runAuditStep('copy fixture',async()=>42,{timeout:100,onProgress:line=>progress.push(line)});
 assert.equal(value,42);assert.match(progress.at(-1),/copy fixture passed/);
 await assert.rejects(runAuditStep('verify signature',async()=>{throw new Error('Damaged signature');},{onProgress:()=>{}}),/Damaged signature/);
});
