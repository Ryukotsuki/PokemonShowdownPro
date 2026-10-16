// Verify convergence against a stopped source marker, rather than comparing
// two moving counters read through separate renderer IPC calls on a busy host.
async function waitForMirrorValue(expected,read,{timeout=10000,interval=50,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const started=now();let observed;
 const expired=()=>Error(`Mirror did not display the final source update within ${timeout}ms (expected ${expected}, observed ${observed ?? 'unavailable'})`);
 while(true){
  let timer;
  try{observed=await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(expired()),Math.max(1,timeout-(now()-started)));})]);}
  finally{clearTimeout(timer);}
  const elapsed=now()-started;
  if(observed===expected&&elapsed<=timeout)return {elapsed,observed};
  if(elapsed>=timeout)throw expired();
  await wait(interval);
 }
}
module.exports={waitForMirrorValue};
