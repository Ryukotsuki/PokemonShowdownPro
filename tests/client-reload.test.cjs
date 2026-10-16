const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {captureReloadState,resumeReloadState,reloadShowdown}=require('../app/client-reload.cjs');
function modern({named=false,initializing=false}={}){
 const joined=[],focused=[],renamed=[];
 const user={name:named?'Saved Player':'Guest 1',named,initializing,challstr:'test-challenge',changeName(name){renamed.push(name);this.name=name;this.named=true;this.initializing=false;}};
 const host={user,connection:{connected:true},rooms:{},join:id=>joined.push(id),focusRoom:id=>focused.push(id),update(){}};
 return {window:{PS:host,__showdownPro:{}},host,user,joined,focused,renamed};
}
const execute=(fn,window,args='')=>vm.runInNewContext('('+fn.toString()+')('+args+')',{window,Date,setTimeout,Promise});
test('reload snapshot retains real battles and replay links without joining fake replay IDs',()=>{
 const h=modern({named:true});
 h.host.rooms={a:{id:'battle-gen9ou-123',battle:{}},b:{id:'battle-gen9ou-proreplay1',battle:{},proReplayURL:'https://replay.pokemonshowdown.com/gen9ou-12'},c:{id:'battle-uploadedreplay',battle:{}},d:{id:'teambuilder'}};h.host.room=h.host.rooms.a;
 const snapshot=execute(captureReloadState,h.window);assert.equal(snapshot.name,'Saved Player');assert.equal(snapshot.selected,'battle-gen9ou-123');assert.equal(snapshot.rooms.length,2);assert.equal(snapshot.rooms[1].replay,h.host.rooms.b.proReplayURL);
});
test('native sign-in retry completes before rejoining a player battle',async()=>{
 const h=modern({initializing:true}),snapshot={name:'Saved Player',rooms:[{id:'battle-gen9ou-123'}],selected:'battle-gen9ou-123'};
 h.host.join=id=>{assert.equal(h.user.named,true);h.joined.push(id);};
 const result=await execute(resumeReloadState,h.window,JSON.stringify(snapshot)+',{retryDelay:0,timeout:500}');
 assert.equal(result.restored,true);assert.deepEqual(h.renamed,['Saved Player']);assert.deepEqual(h.joined,['battle-gen9ou-123']);
});
test('classic native rename retries a saved identity and replays use their local loader',async()=>{
 const data={name:'Guest',named:false},calls=[];
 const user={loaded:true,challstr:'challenge',get:key=>data[key],rename:name=>{data.name=name;data.named=true;calls.push(name);}};
 const window={app:{user,socket:{readyState:1},rooms:{},joinRoom:id=>calls.push(id)},__showdownPro:{},__showdownProReplays:{open:url=>calls.push(url)}};
 await execute(resumeReloadState,window,JSON.stringify({name:'Saved Player',rooms:[{id:'battle-gen9ou-123'},{id:'battle-local-proreplay1',replay:'https://replay.pokemonshowdown.com/gen9ou-12'}]})+',{retryDelay:0,timeout:500}');
 assert.deepEqual(calls,['Saved Player','battle-gen9ou-123','https://replay.pokemonshowdown.com/gen9ou-12']);
});
test('an older saved session cannot rejoin the battle under a different username',async()=>{
 const h=modern({named:true});h.user.name='Older Account';
 h.host.join=id=>{assert.equal(h.user.name,'Saved Player');h.joined.push(id);};
 await execute(resumeReloadState,h.window,JSON.stringify({name:'Saved Player',rooms:[{id:'battle-gen9ou-123'}]})+',{retryDelay:0,timeout:500}');
 assert.deepEqual(h.renamed,['Saved Player']);assert.deepEqual(h.joined,['battle-gen9ou-123']);
});
test('classic reload waits for upkeep rather than mistaking the initial Guest packet for completed sign-in',async()=>{
 const values={name:'Guest 1',named:false},calls=[];
 const user={loaded:false,challstr:'challenge',get:key=>values[key],receiveChallstr:()=>{calls.push('upkeep');user.loaded=true;},rename:name=>{calls.push('rename');values.name=name;values.named=true;}};
 const window={app:{user,socket:{readyState:1},rooms:{},joinRoom:()=>calls.push('join')},__showdownPro:{}};
 await execute(resumeReloadState,window,JSON.stringify({name:'Saved Player',rooms:[{id:'battle-gen9ou-123'}]})+',{retryDelay:0,timeout:500}');
 assert.deepEqual(calls,['upkeep','rename','join']);
});
test('reload uses the same WebContents, bypasses a requested unload prompt and does not wait on ads',async()=>{
 const h=modern({named:true});h.host.rooms={'battle-gen9ou-123':{id:'battle-gen9ou-123',battle:{}}};h.host.room=h.host.rooms['battle-gen9ou-123'];
 const contents=new EventEmitter();let prepared=false,allowed=false,target;
 contents.mainFrame={executeJavaScript:source=>Promise.resolve(vm.runInNewContext(source,{window:h.window,Date,setTimeout,Promise}))};
 contents.loadURL=url=>{assert.ok(prepared);target=url;contents.emit('will-prevent-unload',{preventDefault:()=>allowed=true});queueMicrotask(()=>contents.emit('dom-ready'));return new Promise(()=>{});};
 const result=await reloadShowdown(contents,{prepare:async()=>{prepared=true;},timeout:500});
 assert.equal(result.restored,true);assert.equal(target,'https://play.pokemonshowdown.com/newclient');assert.equal(allowed,true);assert.equal(contents.listenerCount('will-prevent-unload'),0);assert.equal(contents.listenerCount('dom-ready'),0);
});
test('stalled connection produces a bounded error instead of restoring rooms before sign-in',async()=>{
 const h=modern({initializing:true});h.host.connection.connected=false;
 await assert.rejects(execute(resumeReloadState,h.window,JSON.stringify({name:'Saved Player',rooms:[{id:'battle-gen9ou-123'}]})+',{timeout:10}'),/could not finish signing in/);assert.deepEqual(h.joined,[]);
});
test('native password prompt stays visible and restores battles only after the original account signs in',async()=>{
 const h=modern({initializing:true});h.host.rooms.login={};let listener,unsubscribed=false;
 h.user.subscribe=fn=>{listener=fn;return {unsubscribe:()=>unsubscribed=true};};
 const snapshot={name:'Saved Player',rooms:[{id:'battle-gen9ou-123'}]};
 const result=await execute(resumeReloadState,h.window,JSON.stringify(snapshot)+',{retryDelay:0,timeout:500}');
 assert.equal(result.needsLogin,true);assert.deepEqual(h.renamed,[]);assert.deepEqual(h.joined,[]);
 h.user.named=true;h.user.name='Another Player';listener();assert.deepEqual(h.joined,[]);
 h.user.name='Saved Player';listener();assert.deepEqual(h.joined,['battle-gen9ou-123']);assert.equal(unsubscribed,true);
});
