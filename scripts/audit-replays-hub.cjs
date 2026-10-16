const assert=require('node:assert/strict');
module.exports=async({window,client,state,waitFor})=>{
 const run=code=>client.webContents.executeJavaScript('(async()=>{'+code+'})()');
 await waitFor(()=>run('return !!window.__showdownProReplays&&!!document.querySelector(".pro-replays-menu");'));
 const current=state(),record=current.recentReplays[0],original={...record},before=current.statistics;
 const results=await run('return showdownProEvents.searchReplays({username:"Ryukotsuki",page:1});');
 assert.ok(results.results.length,'Production IPC searches the official replay service');
 const url=results.results[0].url.split('?')[0];Object.assign(record,{url,title:results.results[0].players.join(' vs. ')});
 try {
  await window.webContents.executeJavaScript(`pro.openReplay(${JSON.stringify(url)})`);
  const id=await run(`return Object.keys(PS.rooms).find(id=>PS.rooms[id].proReplayURL===${JSON.stringify(url)});`);
  assert.ok(id,'Battle Hub opens its saved replay in the client');
  assert.ok(await run(`return PS.rooms['${id}'].battle.paused&&!PS.rooms['${id}'].connected;`));
  assert.deepEqual(state().statistics,before,'Replay playback does not alter statistics');
  assert.equal(state().rooms.length,0,'Replay playback is not listed as a live game');
  await run("window.open('https://replay.pokemonshowdown.com/');");
  await waitFor(()=>run('return document.querySelector(".pro-replays").open;'));
  const account=await run('return showdownProEvents.replayAccount();');assert.equal(typeof account.userid,'string');
  assert.ok(await run('return [...document.querySelectorAll(".pro-replays button")].every(button=>getComputedStyle(button).backgroundImage.includes("gradient"));'),'Production Pro replay controls keep their theme after all add-ons load');
  assert.equal(await run('return location.origin;'),'https://play.pokemonshowdown.com');
  await run('document.querySelector(".pro-replays header button").click();');
  console.log('Production startup, replay IPC, saved Hub links, replay site popup routing and statistics isolation passed');
 }finally{Object.assign(record,original);}
};
