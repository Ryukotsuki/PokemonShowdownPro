const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { request } = require('./fixtures.cjs');
const source = fs.readFileSync(require.resolve('../app/client-bridge.js'), 'utf8');
// Bridge logic also installs the browser's level-input enhancer. These tests
// exercise battle messages without Pokémon details fields in their DOM.
const browserGlobals = {
  document: { documentElement: {}, querySelectorAll: () => [] },
  MutationObserver: class { observe() {} },
};
function harness({ client = 'old', worker = false } = {}) {
  const received = [], sent = []; const req = request(); const roomId = 'battle-gen9randombattle-123';
  const host = { receive() {}, send(data, room) { sent.push({ data, room }); }, socket: { readyState: 1 }, rooms: { [roomId]: { request: req } } };
  if (client === 'new') {
    host.connection = { connected: true, socket: worker ? null : host.socket };
    delete host.socket;
  }
  host.rooms[roomId].setTimer = value => host.send(`/timer ${value}`, roomId);
  const prefs = {};
  const window = { app: host, Dex: { forGen() {} }, Storage: { prefs(key, value) { if (value !== undefined) prefs[key] = value; return prefs[key]; } }, showdownProEvents: { receive: data => received.push(data), sent() {} } };
  if (client === 'new') { window.PS = host; delete window.app; }
  vm.runInNewContext(source, { window, ...browserGlobals });
  host.receive(`>${roomId}\n|request|${JSON.stringify(req)}`);
  return { host, window, sent, payload: { roomId } };
}
function replayHarness({ client = 'old', finished = true } = {}) {
  const roomId = 'battle-gen9randombattle-123';
  const sent = [], popups = [], received = [];
  const host = {
    socket: { readyState: 1 }, user: { get: key => key === 'named' ? true : key === 'userid' ? 'protest' : null },
    rooms: { '': { searching: false }, [roomId]: { battleEnded: finished, battle: { ended: false }, side: 'p1' } },
    send(data, room) { sent.push({ data, room }); }, receive(data) { received.push(data); },
    leaveRoom(id) { delete this.rooms[id]; return true; },
    addPopup(type, data) { popups.push({ type, data }); },
    addPopupMessage(message) { popups.push({ message }); },
  };
  const ReplayUploadedPopup = function ReplayUploadedPopup() {};
  const window = { app: host, Dex: { forGen() {} }, ReplayUploadedPopup, showdownProEvents: { receive() {}, sent() {} } };
  const uploads = [], queries = [];
  let uploadResult = 'success:gen9randombattle-123';
  if (client === 'new') {
    window.PS = host; delete window.app; delete window.ReplayUploadedPopup;
    host.user = { named:true, userid:'protest' };
    host.alert = (message, options) => popups.push({message,options});
    host.connection = { connected:true, socket:null }; delete host.socket;
    host.server = { id:'showdown' };
    host.mainmenu = { search:{searching:[]}, handleQueryResponse(id, response) { queries.push({id,response}); } };
    host.leave = id => { delete host.rooms[id]; };
    delete host.leaveRoom;
    window.fetch = async (url, options) => {
      uploads.push({url,options});
      if (uploadResult instanceof Error) throw uploadResult;
      return {ok:true,text:async()=>uploadResult};
    };
  }
  vm.runInNewContext(source, { window, setTimeout, clearTimeout, URLSearchParams, ...browserGlobals });

  return { host, window, sent, popups, received, roomId, uploads, queries, setUploadResult(value) { uploadResult=value; } };
}
test('lifecycle tracking alone never sends a command', () => { assert.equal(harness().sent.length, 0); });
test('rooms loaded before bridge installation seed the tracker without replaying or sending',()=>{
  for(const client of ['old','new'])for(const submitted of [false,true]){
    const packets=[],req=request(3),id='battle-gen9randombattle-998';let nativeReceives=0;
    const host={receive(){nativeReceives++;},send(){assert.fail('Bootstrap must not send');},rooms:{[id]:{title:'Existing match',request:req,battle:{stepQueue:['|start','|turn|3']},choice:{waiting:client==='old' && submitted},choices:{isDone:()=>client==='new' && submitted}}}};
    const window={showdownProEvents:{receive:data=>packets.push(data),sent(){}},[client==='old'?'app':'PS']:host};
    vm.runInNewContext(source,{window,...browserGlobals});
    assert.equal(nativeReceives,0);assert.equal(packets.length,1);
    const captured=JSON.parse(packets[0].split('\n').find(line=>line.startsWith('|request|')).slice(9));
    assert.deepEqual(captured,{wait:false,side:{id:req.side.id,name:req.side.name}});
    assert.equal(packets[0].includes('pokemon'),false);
    assert.equal(packets[0].includes('|sentchoice|'),false);
  }
});
test('sidebar timer setting starts an active player battle once and uses the native preference', () => {
  const h = harness();
  assert.equal(h.window.__showdownPro.setAutoTimer(true), true);
  assert.equal(h.window.Storage.prefs('autotimer'), true);
  assert.deepEqual(h.sent, [{ data: '/timer on', room: h.payload.roomId }]);
  assert.equal(h.host.rooms[h.payload.roomId].autoTimerActivated, true);
  h.window.__showdownPro.setAutoTimer(true);
  h.window.__showdownPro.setAutoTimer(false);
  assert.equal(h.window.Storage.prefs('autotimer'), false);
  assert.equal(h.sent.length, 1);
});
test('timer setting avoids spectators, disconnected battles, and timers already running', () => {
  let h = harness();
  h.host.rooms[h.payload.roomId].request = null;
  h.window.__showdownPro.setAutoTimer(true);
  assert.equal(h.sent.length, 0);
  h = harness();
  h.host.socket.readyState = 3;
  h.window.__showdownPro.setAutoTimer(true);
  assert.equal(h.sent.length, 0);
  h.host.socket.readyState = 1;
  h.window.__showdownPro.setAutoTimer(true);
  assert.equal(h.sent.length, 1);
  h = harness();
  h.host.rooms[h.payload.roomId].battle = { kickingInactive: true };
  h.window.__showdownPro.setAutoTimer(true);
  assert.equal(h.sent.length, 0);
  assert.equal(h.host.rooms[h.payload.roomId].autoTimerActivated, true);
});
test('match chat stays plain text and is limited to the current player battle phase',()=>{
  for(const client of ['old','new']) {
    const h=harness({client,worker:true});
    const payload={roomId:h.payload.roomId,phase:'start',text:'Good luck!'};
    for(const text of ['/forfeit',' /choose move 1','hello\n/search gen9ou','x'.repeat(281),'']) assert.equal(h.window.__showdownPro.sendBattleMessage({...payload,text}).sent,false);
    assert.equal(h.window.__showdownPro.sendBattleMessage({...payload,phase:'end'}).sent,false);
    assert.equal(h.window.__showdownPro.sendBattleMessage(payload).sent,true);
    assert.deepEqual(h.sent,[{data:'Good luck!',room:h.payload.roomId}]);
    h.host.receive(`>${h.payload.roomId}\n|win|ProTest`);
    assert.equal(h.window.__showdownPro.sendBattleMessage(payload).sent,false);
    assert.equal(h.window.__showdownPro.sendBattleMessage({...payload,phase:'end',text:'Good game!'}).sent,true);
    delete h.host.rooms[h.payload.roomId];
    assert.equal(h.window.__showdownPro.sendBattleMessage({...payload,phase:'end'}).sent,false);
  }
});
test('match messages are skipped while disconnected or spectating',()=>{
  let h=harness({client:'new',worker:true});h.host.connection.connected=false;
  const payload={roomId:h.payload.roomId,phase:'start',text:'Good luck!'};
  assert.equal(h.window.__showdownPro.sendBattleMessage(payload).sent,false);
  h=harness();h.host.receive(`>${h.payload.roomId}\n|init|battle`);
  assert.equal(h.window.__showdownPro.sendBattleMessage(payload).sent,false);
  assert.equal(h.sent.length,0);
  h=harness();h.host.send('/leavebattle',h.payload.roomId);
  assert.equal(h.window.__showdownPro.sendBattleMessage(payload).sent,false);
  assert.equal(h.sent.length,1);
});
test('new client replay upload failures never return a saved URL', async () => {
  for(const result of ['hash mismatch','invalid id','unexpected response',new Error('Network failed')]) {
    const h=replayHarness({client:'new'}); h.setUploadResult(result);
    const replay=h.window.__showdownPro.saveReplay(h.roomId);
    h.host.mainmenu.handleQueryResponse('savereplay',{id:'gen9randombattle-123',log:'|win|ProTest'});
    const saved=await replay;
    assert.ok(saved.error); assert.equal(saved.url,undefined);
  }
});
test('new client accepts confirmed replay success with an unchanged or private replay ID', async () => {
  for(const response of ['success','success:','success:gen9randombattle-123-private']) {
    const h=replayHarness({client:'new'});h.setUploadResult(response);
    const replay=h.window.__showdownPro.saveReplay(h.roomId);
    h.host.mainmenu.handleQueryResponse('savereplay',{id:'gen9randombattle-123',log:'|win|ProTest'});
    const expected=response.includes('private') ? 'gen9randombattle-123-private' : 'gen9randombattle-123';
    assert.equal((await replay).url,'https://replay.pokemonshowdown.com/'+expected);
  }
});
test('new replay handler preserves unrelated and manual query responses', async () => {
  const h=replayHarness({client:'new'});
  h.host.mainmenu.handleQueryResponse('savereplay',{id:'gen9randombattle-123',log:'manual replay'});
  assert.equal(h.queries.length,1); assert.equal(h.uploads.length,0);
  const replay=h.window.__showdownPro.saveReplay(h.roomId);
  h.host.mainmenu.handleQueryResponse('savereplay',{id:'gen9randombattle-456',log:'different battle'});
  assert.equal(h.queries.length,2); assert.equal(h.uploads.length,0);
  h.host.mainmenu.handleQueryResponse('savereplay',{id:'gen9randombattle-123',log:'|win|ProTest'});
  assert.ok((await replay).url);
});
test('new battle init clears prior completion', async () => {
  const h=replayHarness({client:'new',finished:false});
  h.host.receive(`>${h.roomId}\n|tie`);
  h.host.receive(`>${h.roomId}\n|init|battle`);
  assert.match((await h.window.__showdownPro.saveReplay(h.roomId)).error,/Finished player battle/);
});
test('winning replay waits for confirmed upload and exposes its view URL', async () => {
  const h = replayHarness();
  const upload = h.window.__showdownPro.saveReplay(h.roomId);
  assert.deepEqual(h.sent.at(-1), { data: '/savereplay', room: h.roomId });
  h.host.addPopup(h.window.ReplayUploadedPopup, { id: 'gen9randombattle-123' });
  assert.equal((await upload).url, 'https://replay.pokemonshowdown.com/gen9randombattle-123');
  assert.equal(h.popups.length, 0);
});
test('generic replay confirmation closes automatically after an auto upload', async () => {
  const h = replayHarness();
  const upload = h.window.__showdownPro.saveReplay(h.roomId);
  h.host.addPopup(function GenericPopup() {}, { message: 'Your replay has been uploaded! It\'s available at: https://replay.pokemonshowdown.com/gen9randombattle-123' });
  assert.equal((await upload).url, 'https://replay.pokemonshowdown.com/gen9randombattle-123');
  assert.equal(h.popups.length, 0);
  h.host.addPopupMessage('Your replay has been uploaded! It\'s available at: https://replay.pokemonshowdown.com/gen9randombattle-123');
  assert.equal(h.popups.length, 0);
});
test('manual replay confirmations remain visible', () => {
  const h = replayHarness();
  h.host.addPopupMessage('Your replay has been uploaded! It\'s available at: https://replay.pokemonshowdown.com/gen9randombattle-123');
  assert.equal(h.popups.length, 1);
});
test('HTML replay confirmation with Copy and OK is suppressed for an auto upload', async () => {
  const h = replayHarness();
  const upload = h.window.__showdownPro.saveReplay(h.roomId);
  h.host.addPopup(function GenericPopup() {}, { htmlMessage: '<p>Your replay has been uploaded! It\'s available at: <a href="https://replay.pokemonshowdown.com/gen9randombattle-123">View</a> <button>Copy</button></p>' });
  assert.equal((await upload).url, 'https://replay.pokemonshowdown.com/gen9randombattle-123');
  assert.equal(h.popups.length, 0);
});

test('server HTML popup confirms auto uploads in both clients and preserves other protocol lines', async () => {
  for (const client of ['old','new']) {
    const h=replayHarness({client});
    const replay=h.window.__showdownPro.saveReplay(h.roomId);
    h.host.receive('|popup||html|<p>Your replay has been uploaded! It\'s available at:</p><a href="https://replay.pokemonshowdown.com/gen9randombattle-123">View</a><button>Copy</button>\n|updatesearch|{}');
    assert.equal((await replay).url,'https://replay.pokemonshowdown.com/gen9randombattle-123');
    assert.equal(h.received.at(-1),'|updatesearch|{}');assert.equal(h.popups.length,0);
    const before=h.received.length;
    h.host.receive('|popup|Your replay has been uploaded! https://replay.pokemonshowdown.com/gen9randombattle-123');
    assert.equal(h.received.length,before);
  }
});

test('new client alerts confirm private replay URLs and preserve manual or unrelated alerts', async () => {
  const h=replayHarness({client:'new'}),url='https://replay.pokemonshowdown.com/gen9randombattle-123-private';
  h.host.alert('Your replay has been uploaded! '+url,{width:620});assert.equal(h.popups.length,1);
  const replay=h.window.__showdownPro.saveReplay(h.roomId);
  h.host.alert('Your replay has been uploaded! https://replay.pokemonshowdown.com/gen9randombattle-1234');
  h.host.alert('Disconnected.',{width:500});assert.equal(h.popups.length,3);
  h.host.alert('Your replay has been uploaded! '+url);assert.equal((await replay).url,url);assert.equal(h.popups.length,3);
  h.host.alert('Your replay has been uploaded! '+url);assert.equal(h.popups.length,3);
});

test('manual and other-battle server popups are passed through without settling an upload', async () => {
  const h=replayHarness({client:'new'});
  const manual='|popup|Your replay has been uploaded! https://replay.pokemonshowdown.com/gen9randombattle-123';
  h.host.receive(manual);assert.equal(h.received.at(-1),manual);
  const replay=h.window.__showdownPro.saveReplay(h.roomId);
  const unrelated='|popup|Your replay has been uploaded! https://replay.pokemonshowdown.com/gen9randombattle-456';
  h.host.receive(unrelated);assert.equal(h.received.at(-1),unrelated);
  const roomMessage='>'+h.roomId+'\n'+manual;
  h.host.receive(roomMessage);assert.equal(h.received.at(-1),roomMessage);
  h.host.receive(manual);assert.ok((await replay).url);
});

test('private classic popup and configured third-party replay IDs match the correct upload', async () => {
  for (const server of ['showdown','testserver']) {
    const h=replayHarness();h.host.server={id:server};
    const replay=h.window.__showdownPro.saveReplay(h.roomId);
    const id=(server==='showdown'?'':'testserver-')+'gen9randombattle-123-private';
    h.host.addPopup(h.window.ReplayUploadedPopup,{id});
    assert.equal((await replay).url,'https://replay.pokemonshowdown.com/'+id);assert.equal(h.popups.length,0);
  }
});
test('replay upload errors do not create a saved replay link', async () => {
  const h = replayHarness();
  const upload = h.window.__showdownPro.saveReplay(h.roomId);
  h.host.addPopupMessage('Error while uploading replay: unavailable');
  assert.match((await upload).error, /unavailable/);
  assert.equal(h.popups.length, 0);
});
