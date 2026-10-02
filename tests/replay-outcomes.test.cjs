const {test}=require('node:test'),assert=require('node:assert/strict');
const {replayOutcome,fetchReplayOutcome}=require('../app/replay-outcomes.cjs');
const players='|player|p1|Ryukotsuki|1\n|player|p2|Opponent|2\n';
test('replay results use the winner and account regardless of player position or title',()=>{
  assert.equal(replayOutcome(players+'|win|Ryukotsuki','ryukotsuki'),'win');
  assert.equal(replayOutcome(players+'|win|Opponent','Ryukotsuki'),'loss');
  assert.equal(replayOutcome(players+'|win|Opponent','opponent'),'win');
  assert.equal(replayOutcome(players+'|tie','ryukotsuki'),'tie');
  for(const log of [players,players+'|win|Unknown','<html>Not found</html>'])assert.equal(replayOutcome(log,'Ryukotsuki'),null);
  assert.equal(replayOutcome(players+'|win|Opponent','spectator'),null);
});
test('legacy result lookups retain private URLs, use no cookies, and handle unavailable replays',async()=>{
  const url='https://replay.pokemonshowdown.com/gen9randombattle-123-private';let calls=0;
  assert.equal(await fetchReplayOutcome(url,'ryukotsuki',async(target,options)=>{
    calls++;assert.equal(target,url+'.log');assert.equal(options.credentials,'omit');assert.ok(options.signal);
    return {ok:true,text:async()=>players+'|win|Ryukotsuki'};
  }),'win');assert.equal(calls,1);
  assert.equal(await fetchReplayOutcome(url,'ryukotsuki',async()=>({ok:false})),null);
  assert.equal(await fetchReplayOutcome(url,'ryukotsuki',async()=>{throw new Error('Offline');}),null);
  assert.equal(await fetchReplayOutcome('https://example.com/123','ryukotsuki',()=>{throw new Error('Must not fetch');}),null);
});
