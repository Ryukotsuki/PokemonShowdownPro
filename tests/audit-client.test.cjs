const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadAuditClient}=require('../scripts/audit-client.cjs');

test('audit navigation retries a transient failure and waits for the next successful load',async()=>{
  let calls=0;
  const contents={loadURL:async()=>{if(++calls===1)throw new Error('ERR_CONNECTION_RESET');},stop:()=>assert.fail('A completed navigation must not be stopped')};
  await loadAuditClient(contents,'https://play.pokemonshowdown.com/oldclient',{timeout:100});
  assert.equal(calls,2);
});

test('a stalled audit navigation is stopped and fails within its own deadline',async()=>{
  let stopped=0;
  const contents={loadURL:()=>new Promise(()=>{}),stop:()=>{stopped++;}};
  await assert.rejects(loadAuditClient(contents,'https://play.pokemonshowdown.com/newclient',{timeout:10,attempts:2}),/Client navigation timed out/);
  assert.equal(stopped,2);
});

test('persistent client load failures are not treated as successful compatibility checks',async()=>{
  let calls=0;
  const contents={loadURL:async()=>{calls++;throw new Error('ERR_NAME_NOT_RESOLVED');},stop:()=>{}};
  await assert.rejects(loadAuditClient(contents,'https://play.pokemonshowdown.com/oldclient',{timeout:100}),/ERR_NAME_NOT_RESOLVED/);
  assert.equal(calls,2);
});
