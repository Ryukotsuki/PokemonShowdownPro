const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BattleMessages}=require('../app/battle-messages.cjs');
const {Battles}=require('../app/battles.cjs');
const {history}=require('./fixtures.cjs');
const settings={startEnabled:true,startText:'Good luck!',endEnabled:true,endText:'Good game!'};
function room() {return {id:'battle-gen9randombattle-123',playerSide:'p1',started:true,turn:1,ended:false,title:'You vs. Opponent'};}
test('greetings and closing messages send once, including concurrent events and reconnects',async()=>{
  const sent=[],statuses=[];
  const messages=new BattleMessages({send:async payload=>{sent.push(payload);return {sent:true};},onStatus:s=>statuses.push(s)});
  const battle=room();
  await Promise.all([messages.process(battle,settings),messages.process(battle,settings)]);
  await messages.process({...battle},settings);
  battle.ended=true;battle.finishReason='win';
  await Promise.all([messages.process(battle,settings),messages.process(battle,settings)]);
  await messages.process({...battle},settings);
  assert.deepEqual(sent.map(s=>s.phase),['start','end']);
  assert.deepEqual(sent.map(s=>s.text),['Good luck!','Good game!']);
  assert.equal(statuses.length,2);
});
test('messages ignore spectators, team preview, historical greetings and rooms closed without a result',async()=>{
  const sent=[],messages=new BattleMessages({send:p=>sent.push(p)});
  for(const change of [{playerSide:null},{started:false},{turn:7},{ended:true,finishReason:'deinit'}]) await messages.process({...room(),...change},settings);
  await messages.process(room(),{...settings,startEnabled:false});
  assert.equal(sent.length,0);
  for(const finishReason of ['win','tie']) await messages.process({...room(),id:'battle-'+finishReason,ended:true,finishReason},settings);
  assert.equal(sent.length,2);
});
test('a lost or rejected send is never automatically repeated',async()=>{
  let attempts=0;
  const messages=new BattleMessages({send:async()=>{attempts++;throw new Error('IPC lost');}});
  await messages.process(room(),settings);
  await messages.process(room(),settings);
  assert.equal(attempts,1);
});
test('protocol tracking identifies fresh player starts and clears player role on reconnect',()=>{
  const battles=new Battles(),id='battle-gen9randombattle-123';
  battles.receive('>'+id+'\n'+history().join('\n'));
  assert.equal(battles.rooms.get(id).started,true);
  assert.equal(battles.rooms.get(id).playerSide,'p1');
  battles.receive('>'+id+'\n|init|battle\n|start\n|turn|8');
  assert.equal(battles.rooms.get(id).turn,8);
  assert.equal(battles.rooms.get(id).playerSide,null);
});
