const {test}=require('node:test'),assert=require('node:assert/strict');
const {waitForMirrorValue}=require('../scripts/streamer-audit-timing.cjs');

test('a delayed renderer can converge after the old 16-tick cutoff',async()=>{
 let clock=0,reads=0;
 const result=await waitForMirrorValue(42,async()=>{reads++;return clock<700?23:42;},{timeout:1000,now:()=>clock,wait:async ms=>{clock+=ms;}});
 assert.equal(result.observed,42);assert.equal(result.elapsed,700);assert.ok(reads>1);
});

test('a frozen picture or missing canvas still fails with the observed value',async()=>{
 for(const value of [23,null]){
  let clock=0;
  await assert.rejects(waitForMirrorValue(42,async()=>value,{timeout:200,now:()=>clock,wait:async ms=>{clock+=ms;}}),error=>{
   assert.match(error.message,/did not display the final source update within 200ms/);
   assert.match(error.message,new RegExp('observed '+(value??'unavailable')));return true;
  });
 }
});

test('an unresponsive renderer cannot hold the audit past its read deadline',async()=>{
 await assert.rejects(waitForMirrorValue(42,()=>new Promise(()=>{}),{timeout:20}),/final source update within 20ms/);
 let clock=0;
 await assert.rejects(waitForMirrorValue(42,async()=>{clock=201;return 42;},{timeout:200,now:()=>clock}),/final source update within 200ms/);
});
