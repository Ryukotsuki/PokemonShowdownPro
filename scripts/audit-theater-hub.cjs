const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({window,client,state,waitFor,preferencesFile,getMirror})=>{
 window.setSkipTaskbar(true);window.setOpacity(0.01);window.showInactive();
 const wc=client.webContents,run=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
 wc.setBackgroundThrottling(false);
 const before=client.getBounds(),saved={...state().settings.theaterLayout};
 const engine=state().settings.foulPlayEnabled;
 if(engine!==undefined)await window.webContents.executeJavaScript("pro.setSetting('foulPlayEnabled',false)");
 console.log('Theater app audit: waiting for client and calculator');
 await waitFor(()=>run('return !!document.querySelector("[data-showdex-module=hellodex]")&&!!window.__showdownProTheater;'));
 console.log('Theater app audit: ready');
 assert.equal(await run('return __showdownProTheater.active;'),null,'Startup stays in normal mode');
 const {history,request}=require('../tests/fixtures.cjs'),id='battle-gen9randombattle-998957';
 await run(`const host=window.app||window.PS;if(window.app){app.socket.send=()=>{};app.user.set({name:'ProTest',named:true});}else{PS.connection.send=()=>{};PS.user.setName('ProTest',true,'1');}host.receive(${JSON.stringify('>'+id+'\n'+history().join('\n'))});host.focusRoom('${id}');`);
 console.log('Theater app audit: room created');
 await waitFor(()=>run(`return !!(window.app||window.PS).rooms['${id}']?.battle;`));
 console.log('Theater app audit: battle mounted');
 await run(`(window.app||window.PS).rooms['${id}'].battle.seekTurn(Infinity);`);
 console.log('Theater app audit: seeking complete');
 await waitFor(()=>run(`return !!document.getElementById('room-${id}')?.querySelector('.pro-theater-toggle');`));
 await run(`__showdownProTheater.toggle('${id}');`);
 await waitFor(()=>client.getBounds().width===window.getContentSize()[0]);
 assert.ok(client.getBounds().width>before.width,'Battle takes the Battle Hub area');
 const layout={width:420,chatShare:0.45,chatCollapsed:true,calcCollapsed:false};
 assert.deepEqual(await run(`return await showdownProEvents.setTheaterLayout(${JSON.stringify(layout)});`),layout);
 assert.deepEqual(JSON.parse(fs.readFileSync(preferencesFile)).theaterLayout,layout);
 await assert.rejects(run('return showdownProEvents.setTheaterLayout({width:9999});'),/Invalid Theater layout/);
 for(const key of ['streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])await window.webContents.executeJavaScript(`pro.setSetting('${key}',false)`);
 await window.webContents.executeJavaScript("pro.setSetting('streamerEnabled',true)");
 const mirror=getMirror();await waitFor(()=>mirror.stats.painted>0&&!!mirror.lastFrame);
 const {collectMirrorMap,maskRectangles}=require('../app/streamer-mode.cjs');
 const map=await run(`return (${collectMirrorMap})({showdex:false,moves:false,tooltips:false,teras:false});`);
 assert.ok(map.masks.length,'Theater streamer regions are mapped');
 const frame=mirror.lastFrame.client;
 for(const rect of maskRectangles(map.masks,map,frame)){
  const x=rect.x+Math.floor(rect.width/2),y=rect.y+Math.floor(rect.height/2);
  const top=maskRectangles(map.masks,map,frame).findLast(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height);
  const offset=(y*frame.width+x)*4,color=top.color||[20,40,56,255],expected=frame.format==='bgra'?[color[2],color[1],color[0],255]:color;
  assert.deepEqual([...frame.pixels.subarray(offset,offset+4)],expected,'Theater private pixels are masked before transfer');
 }
 assert.equal(await mirror.window.webContents.executeJavaScript('typeof pro'),'undefined');
 await window.webContents.executeJavaScript("pro.setSetting('streamerEnabled',false)");
 console.log('Theater + Streamer Mode: native mirror draws, private controls/calculator covered, no privileged app bridge.');
 await run('__showdownProTheater.exit();');await waitFor(()=>client.getBounds().width===before.width);
 await run(`await showdownProEvents.setTheaterLayout(${JSON.stringify(saved)});`);
 if(engine!==undefined){await run(`(window.app||window.PS).receive(${JSON.stringify('>'+id+'\n|win|ProTest')});(window.app||window.PS).rooms['${id}'].battle.seekTurn(Infinity);`);await window.webContents.executeJavaScript(`pro.setSetting('foulPlayEnabled',${engine})`);}
 console.log('Theater native app: normal startup, full client bounds, saved settings, IPC validation and Battle Hub restoration passed; muted.');
};
