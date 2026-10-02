const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Battles}=require('../app/battles.cjs');
const {history,request}=require('./fixtures.cjs');
test('player lifecycle tracks results without storing private teams or turn history',()=>{
 const battles=new Battles(),id='battle-gen9randombattle-123';
 battles.receive('>'+id+'\n'+history().join('\n'));
 const room=battles.rooms.get(id);
 assert.equal(room.playerName,'ProTest');assert.equal(room.turn,1);assert.equal(room.status,'Your turn');
 assert.equal(room.history,undefined);assert.equal(room.request,undefined);
 battles.receive('>'+id+'\n|win|Opponent');assert.equal(room.outcome,'loss');assert.equal(room.ended,true);
});
test('multiple rooms, player side changes, ties and spectators stay isolated',()=>{
 const battles=new Battles(),one='battle-gen9ou-1',two='battle-gen9doublesou-2';
 battles.receive('>'+one+'\n'+history().join('\n')+'\n>'+two+'\n|init|battle\n|player|p1|Opponent\n|player|p2|ProTest\n|request|'+JSON.stringify({side:{id:'p2',name:'ProTest'}})+'\n|win|Pro Test');
 assert.equal(battles.rooms.get(two).outcome,'win');assert.equal(battles.rooms.get(one).ended,false);
 battles.receive('>'+one+'\n|tie');assert.equal(battles.rooms.get(one).outcome,'tie');
 battles.receive('>battle-gen9ou-3\n|init|battle\n|win|ProTest');assert.equal(battles.rooms.get('battle-gen9ou-3').outcome,null);
});
test('reconnects reset player identity; manual choices and leaving update status',()=>{
 const battles=new Battles(),id='battle-gen9randombattle-123';
 battles.receive('>'+id+'\n'+history().join('\n'));
 battles.sent(id,'/choose move 1|1');assert.equal(battles.rooms.get(id).status,'Waiting for opponent');
 battles.sent(id,'/undo');assert.equal(battles.rooms.get(id).status,'Your turn');
 battles.receive('>'+id+'\n|init|battle\n|start\n|turn|8');assert.equal(battles.rooms.get(id).playerSide,null);
 battles.receive('>'+id+'\n|request|'+JSON.stringify(request()));battles.sent(id,'/leavebattle');
 assert.equal(battles.rooms.get(id).playerSide,null);assert.equal(battles.rooms.get(id).ended,true);
});
test('malformed packets do not allocate non-battle rooms or retain unbounded history',()=>{
 const battles=new Battles();battles.receive('>lobby\n|turn|1');battles.receive(null);assert.equal(battles.rooms.size,0);
 for(let i=0;i<40;i++) battles.receive('>battle-gen9ou-'+i+'\n|init|battle\n|deinit');
 assert.equal(battles.rooms.size,30);battles.reset();assert.equal(battles.rooms.size,0);
});
