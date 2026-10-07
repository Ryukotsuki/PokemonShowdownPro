const {runProcess}=require('../app/update-process.cjs');
const {verifySignature}=require('./verify-macos-package.cjs');

async function sealFixtureBundle(bundle,{run=runProcess}={}) {
 // Fixture edits affect only Resources/app JavaScript and package.json. Keep
 // the already verified framework/helper/runtime signatures and renew the
 // outer resource seal, instead of walking and re-signing every nested file.
 await run('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',
  '--preserve-metadata=entitlements,requirements,flags',bundle],{timeout:120000});
 await verifySignature(bundle,{run});
}
async function runAuditStep(label,operation,{timeout=180000,onProgress=console.log}={}) {
 const started=Date.now();let timer;
 onProgress(label+'…');
 try {
  const result=await Promise.race([
   Promise.resolve().then(operation),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Portable update audit timed out during '+label)),timeout);}),
  ]);
  onProgress(label+' passed ('+((Date.now()-started)/1000).toFixed(1)+'s).');
  return result;
 }finally{clearTimeout(timer);}
}
module.exports={sealFixtureBundle,runAuditStep};
