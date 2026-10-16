// Loaded by the muted main-process smoke run; never sends battle choices.
const assert=require('node:assert/strict');
module.exports=async({window,client,state,waitFor})=>{
 const wc=client.webContents,run=code=>wc.mainFrame.executeJavaScript('(async()=>{'+code+'})()');
 const modern=await run('return !!window.PS;'),host=modern?'PS':'app';
 const ready=modern?'PS.connection?.connected&&!PS.user.initializing':'app.socket?.readyState===1&&app.user.loaded';
 const snapshot=()=>run(`return {modern:!!window.PS,connected:!!(${modern?'PS.connection?.connected':'app.socket?.readyState===1'}),initializing:${modern?'PS.user.initializing':'!app.user.loaded'},selected:${modern?'PS.leftPanel?.id':'app.curRoom?.id'},header:document.querySelector('.userbar')?.textContent};`);
 const reload=async()=>{
  const result=await window.webContents.executeJavaScript('pro.reload()');
  assert.ok(result?.restored,'Reload finishes native connection and sign-in before returning');
  await waitFor(()=>state().showdexStatus==='Showdex loaded');
  assert.ok(await run('return !!('+ready+');'));
  assert.ok(await run('return !!window.__showdownPro&&!!window.__SHOWDEX_INIT;'));
  assert.ok(!/Connecting|Loading/.test((await snapshot()).header||''),'Native header finishes initializing');
 };
 const {history,request}=require('../tests/fixtures.cjs');
 try{
  await waitFor(()=>run('return !!('+ready+');'));
  await run(modern?"PS.addRoom({id:'battles'});":"app.joinRoom('battles');");
  await waitFor(()=>run(modern?'return PS.rooms.battles?.battles?.length>0;':'return Object.keys(app.rooms.battles?.data?.rooms||{}).length>0;'));
  const liveId=await run(modern?'return PS.rooms.battles.battles[0].id;':'return Object.keys(app.rooms.battles.data.rooms)[0];');
  await run(`${host}.${modern?'join':'joinRoom'}(${JSON.stringify(liveId)});`);
  await waitFor(()=>run(`return !!${host}.rooms[${JSON.stringify(liveId)}]?.battle?.stepQueue.length;`));
  await reload();
  await waitFor(()=>run(`return !!${host}.rooms[${JSON.stringify(liveId)}]?.battle?.stepQueue.length;`));
  assert.equal((await snapshot()).selected,liveId,'Live spectator battle stays selected after reload');
  console.log('Live spectator reconnected: '+JSON.stringify(await snapshot()));
  for(const player of [false,true]){
   const id='battle-gen9randombattle-99897'+(player?'2':'1');
   const log=history().filter(line=>!line.startsWith('|request|'));if(player)log.push('|request|'+JSON.stringify(request()));
   await run(`${host}.receive(${JSON.stringify('>'+id+'\n'+log.join('\n'))});${host}.focusRoom('${id}');`);
   await waitFor(()=>run(`return !!${host}.rooms['${id}']?.battle;`));
   await reload();
   console.log((player?'Player':'Spectator')+' fixture reconnected: '+JSON.stringify(await snapshot()));
  }
  const replayId=await run('const list=await showdownProEvents.searchReplays({});return __showdownProReplays.open(list.results[0].url);');
  assert.ok(replayId,'Official replay loads before reload');
  await reload();
  assert.ok(await run(`const room=${host}.rooms[${modern?'PS.leftPanel.id':'app.curRoom.id'}];return room?.proReplayURL&&room.battle.stepQueue.length>0&&!room.connected;`),'Local replay remains playable after reload');
  console.log((modern?'New':'Classic')+' client reload passed: live spectator, player fixture, replay, native header and Showdex');
 }catch(error){console.error('Reload failure state:',await snapshot().catch(()=>null));throw error;}
};
