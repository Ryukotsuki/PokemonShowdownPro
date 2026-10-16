const {runProcess}=require('../app/update-process.cjs');
const {verifySignature}=require('./verify-macos-package.cjs');
const {execFile}=require('node:child_process');
const execute=require('node:util').promisify(execFile);

async function createFixtureDmg(folder,archive,{run=execute,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onProgress=console.log}={}) {
 // Match the release builder's bounded hdiutil retries. Exit 1 can be a
 // transient disk-image service failure on CI, even with no diagnostic text.
 const args=['create','-srcfolder',folder,'-volname','Pro Update Audit','-fs','HFS+',
  '-format','UDZO','-nospotlight','-ov',archive];
 for(let attempt=1;attempt<=3;attempt++){
  try{return await run('/usr/bin/hdiutil',args,{timeout:120000,maxBuffer:1024*1024});}
  catch(error){
   const details=[error.stdout,error.stderr].filter(Boolean).join('\n').trim().slice(-16000);
   onProgress(`DMG creation attempt ${attempt}/3 failed (exit ${error.code ?? 'unknown'}): ${details||error.message}`);
   if(attempt===3||error.killed||error.signal||![1,16,35,256,49153].includes(Number(error.code)))
    throw new Error(`Fixture DMG creation failed after ${attempt} attempt(s): ${details||error.message}`,{cause:error});
   await wait(attempt*5000);
  }
 }
}

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
module.exports={sealFixtureBundle,runAuditStep,createFixtureDmg};
