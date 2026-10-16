require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,protocol,net,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {StreamerStream,collectMirrorMap,maskRectangles}=require('../app/streamer-mode.cjs');
const {history,request}=require('../tests/fixtures.cjs');
const {loadAuditClient,isolateAuditNetwork}=require('./audit-client.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/streamer-mode');
protocol.registerSchemesAsPrivileged([{scheme:'showdown-pro',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setPath('userData',path.join(out,process.argv.includes('--gpu')?'mirror-gpu-profile':'mirror-profile'));if(!process.argv.includes('--gpu'))app.disableHardwareAcceleration();
setTimeout(()=>{console.error('Stream mirror audit timed out');app.exit(1);},240000).unref();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(test,label){const end=Date.now()+40000;while(Date.now()<end){if(await test())return;await pause(100);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});for(const file of ['failure.log','player-failure.png','stream-failure.png'])fs.rmSync(path.join(out,file),{force:true});
 const clientSession=session.fromPartition('streamer-audit-client');isolateAuditNetwork(clientSession);
 const streamSession=session.fromPartition('pro-streamer-stream');isolateAuditNetwork(streamSession);
 const assets=async req=>{const url=new URL(req.url),base=url.hostname==='stream'?path.join(root,'app/stream'):url.hostname==='showdex'?path.join(root,'build/showdex'):url.hostname==='assets'?path.join(root,'app/assets'):null;if(!base)return new Response('',{status:404});const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(base+path.sep))return new Response('',{status:403});const response=await net.fetch(pathToFileURL(file).href),headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','https://play.pokemonshowdown.com');return new Response(response.body,{status:response.status,headers});};
 streamSession.protocol.handle('showdown-pro',assets);clientSession.protocol.handle('showdown-pro',assets);
 const source=new BrowserWindow({show:false,width:process.argv.includes('--compact-start')?760:1400,height:900,webPreferences:{session:clientSession,offscreen:true,backgroundThrottling:false}});source.webContents.setAudioMuted(true);
 source.webContents.on('console-message',details=>{if(details.level==='error'&&/TypeError|Uncaught|Showdex/.test(details.message))console.error('Player renderer:',details.message.slice(0,500));});
 const hub=new BrowserWindow({show:false,width:360,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}});hub.webContents.setAudioMuted(true);
 await hub.loadURL('data:text/html,'+encodeURIComponent('<body style="margin:0;background:#203d51;color:white;font:24px Arial"><h1>Battle Hub</h1></body>'));
 let visibility={hub:false,showdex:false,moves:false},barrier;const captures=new WeakMap();
 const stream=new StreamerStream({createWindow:options=>new BrowserWindow({...options,webPreferences:{...options.webPreferences,offscreen:true}}),contents:()=>source.webContents,visible:false,interval:100,visibility:()=>visibility,hub:()=>({contents:hub.webContents,x:0,width:360,height:hub.getContentSize()[1]}),capture:async contents=>{const action=barrier;barrier=null;const image=await stream.nextImage(contents);if(action)await action();return image;},onFrame:image=>{if(stream.lastFrame&&image)captures.set(stream.lastFrame,image);}});
 const sourceRun=code=>source.webContents.executeJavaScript(code),reports=[];
 const loadClient=async version=>{
  await loadAuditClient(source.webContents,'https://play.pokemonshowdown.com/'+version+'client');const host=version==='old'?'app':'PS';
  await wait(()=>sourceRun(`!!window.${host}?.rooms`),'client ready');await wait(()=>sourceRun(version==='old'?'app.socket?.readyState===1':'PS.connection?.connected'),'client connected');
  await sourceRun(version==='old'?"app.socket.send=()=>{};app.user.set({name:'ProTest',named:true});Storage.prefs('autotimer',false);":"PS.connection.send=()=>{};PS.user.setName('ProTest',true,'1');PS.prefs.set('autotimer',false);");
  await sourceRun(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8'));await source.webContents.insertCSS(require('../app/client-theme-css.cjs'),{cssOrigin:'user'});
  await sourceRun(fs.readFileSync(path.join(root,'build/showdex/main.js'),'utf8'));await wait(()=>sourceRun('!!document.querySelector("[data-showdex-module=hellodex]")&&!!window.__showdownProCalcdex'),'Showdex loaded');
 };
 const ready=async()=>{await wait(()=>!!stream.lastFrame,'masked mirror frame');await wait(()=>stream.window.webContents.executeJavaScript('!document.getElementById("mirror").hidden'),'canvas decoded');};
 // Pair each frame with its own capture across asynchronous renderer reads.
 const pixels=frame=>{const image=captures.get(frame);assert.ok(image,'Frame has its matching source capture');return image.toBitmap({scaleFactor:1});};
 const maskedPixel=(frame,map,rect)=>{const size={width:frame.client.width,height:frame.client.height},bounds=maskRectangles([rect],map,size)[0],bytes=frame.client.pixels;const offset=((bounds.y+Math.floor(bounds.height/2))*size.width+bounds.x+Math.floor(bounds.width/2))*4,pixel=[...bytes.subarray(offset,offset+4)];return frame.client.format==='rgba'?[pixel[2],pixel[1],pixel[0],pixel[3]]:pixel;};
 try{
  await stream.open();assert.equal(stream.window.webContents.isAudioMuted(),true);assert.equal(await stream.window.webContents.executeJavaScript('typeof pro'),'undefined');
  for(const version of ['old','new']){
   const host=version==='old'?'app':'PS',id='battle-gen9randombattle-'+(version==='old'?998901:998902);
   source.setContentSize(process.argv.includes('--compact-start')?760:1400,900);
   await loadClient(version);
   // Auto mode can choose a chat overlay on a small CI desktop, which has no
   // navigation tab. This audit specifically verifies that tab stays visible;
   // select panel mode in this isolated database, then reload it into Showdex.
   await sourceRun(`new Promise((resolve,reject)=>{
    const req=indexedDB.open('showdex');req.onerror=()=>reject(req.error);req.onsuccess=()=>{
     const db=req.result,tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),get=store.get('calcdex');
     get.onsuccess=()=>store.put({...get.result,openAs:'panel',openOnStart:'always',closeOn:'never'},'calcdex');
     tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};
    };
   });`);
   await loadClient(version);
   await sourceRun(`document.documentElement.classList.add('showdown-pro','dark');${host}.receive(${JSON.stringify('>'+id+'\n'+history().filter(line=>!line.startsWith('|request|')).join('\n'))});${host}.receive(${JSON.stringify('>'+id+'\n|request|'+JSON.stringify(request()))});${host}.focusRoom(${JSON.stringify(id)});void 0;`);
   await wait(()=>sourceRun(`!!${host}.rooms[${JSON.stringify(id)}]?.battle`),'Battle mounted');
   await sourceRun(`${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);void 0;`);
   await wait(()=>sourceRun(`document.getElementById('room-${id}').textContent.includes('Dragon Pulse')`),'own moves still visible');
   await wait(()=>sourceRun('!!document.querySelector(\'[id^="roomtab-calcdex"],a.roomtab[href*="calcdex"]\')'),'Calcdex panel navigation mounted');
   // Both sidebar Tera cards must follow their own switch even when every
   // other visibility option is on, in landscape and portrait captures.
   await sourceRun(`(()=>{for(const [side,edge] of [['you','left'],['opponent','right']]){const card=document.createElement('div');card.className='ditTeraInfo';card.dataset.side=side;card.style='position:fixed;'+edge+':10px;top:240px;width:80px;height:90px;box-sizing:border-box;background:#bb22dd;z-index:999999';card.innerHTML='<span class="ditTeraLabel">Tera</span><strong class="ditPokemonName">'+(side==='you'?'Calyrex-Ice':'Mienshao')+'</strong><span class="ditTeraType">'+(side==='you'?'Fighting':'Poison')+'</span>';document.body.append(card);}})();void 0;`);
   for(const size of [[1400,900],[760,1100]]){
    source.setContentSize(...size);await pause(150);
    const cards=await sourceRun(`[...document.querySelectorAll('.ditTeraInfo')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+8,y:r.y+75,width:1,height:1};})`);
    for(const teras of [false,true,false]){
     visibility={hub:false,showdex:true,moves:true,tooltips:true,teras};stream.invalidate();await ready();
     const frame=stream.lastFrame,map=await sourceRun(`(${collectMirrorMap})(${JSON.stringify(visibility)})`);
     const original={client:{...frame.client,pixels:pixels(frame)}};
     for(const card of cards)assert.deepEqual(maskedPixel(frame,map,card),teras?maskedPixel(original,map,card):[56,40,20,255],'Both sidebar Tera cards follow the independent toggle at '+size.join('x'));
     if(teras)assert.ok(Buffer.from(frame.client.pixels).equals(pixels(frame)),'Showing Teras keeps the original capture intact');
     assert.equal(await sourceRun('document.querySelectorAll(".ditTeraInfo").length'),2,'Local Tera reminders remain visible');
    }
   }
   await sourceRun('for(const card of document.querySelectorAll(".ditTeraInfo"))card.remove();void 0;');source.setContentSize(1400,900);await pause(150);
   console.log(version+' client: sidebar Teras hide/show independently in portrait and landscape.');
   // Distinct sentinel panels also exercise overlays and their removal without
   // relying on OCR or copying private text into the stream renderer.
   await sourceRun(`(()=>{const a=document.createElement('div');a.id='mirror-move-marker';a.className='movemenu';a.style='position:fixed;left:20px;top:120px;width:160px;height:80px;background:#00ff00;z-index:999999';a.textContent='Private move';const b=document.createElement('div');b.id='mirror-showdex-marker';b.dataset.showdexModule='calcdex';b.style='position:fixed;left:220px;top:120px;width:160px;height:80px;background:#ff00ff;z-index:999999';b.textContent='Private calculator';document.body.append(a,b);})();void 0;`);
   const rects=await sourceRun(`['mirror-move-marker','mirror-showdex-marker'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})`);
   for(const config of [{hub:false,showdex:false,moves:false,tooltips:false},{hub:false,showdex:true,moves:false,tooltips:false},{hub:false,showdex:false,moves:true,tooltips:false},{hub:true,showdex:true,moves:true,tooltips:true,teras:true}]){
    visibility=config;stream.invalidate();await ready();const frame=stream.lastFrame,map=await sourceRun(`(${collectMirrorMap})(${JSON.stringify(config)})`);
    const move=maskedPixel(frame,map,rects[0]),calculator=maskedPixel(frame,map,rects[1]);
    assert.deepEqual(move,config.moves?[0,255,0,255]:[56,40,20,255]);assert.deepEqual(calculator,config.showdex?[255,0,255,255]:[56,40,20,255]);assert.equal(!!frame.hub,config.hub);
    const paintedMasks=maskRectangles(map.masks,map,{width:frame.client.width,height:frame.client.height});
    for(const mask of map.masks){const bounds=maskRectangles([mask],map,{width:frame.client.width,height:frame.client.height})[0];if(!bounds)continue;const x=bounds.x+Math.floor(bounds.width/2),y=bounds.y+Math.floor(bounds.height/2),top=[...paintedMasks].reverse().find(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height);assert.deepEqual(maskedPixel(frame,map,mask),top.color?[top.color[2],top.color[1],top.color[0],255]:[56,40,20,255],'Hidden region is covered: '+JSON.stringify(mask));}
    const tab=await sourceRun(`(()=>{const e=document.querySelector('#roomtab-hellodex,a.roomtab[href$="hellodex"],[data-roomid="hellodex"]');const r=e?.getBoundingClientRect();return r&&r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;})()`);
    assert.ok(tab,'Hellodex navigation tab is available');
    const original={client:{...frame.client,pixels:pixels(frame)}};
    assert.deepEqual(maskedPixel(frame,map,tab),maskedPixel(original,map,tab),'Hellodex tab remains visible even when Showdex is hidden');
    for(const x of [tab.x+1,tab.x+tab.width-2]){const edge={x,y:tab.y+tab.height/2,width:1,height:1};assert.deepEqual(maskedPixel(frame,map,edge),maskedPixel(original,map,edge),'Neighboring calculator masks leave the Hellodex tab edges intact');}
    const calcTab=await sourceRun(`(()=>{const e=document.querySelector('[id^="roomtab-calcdex"],a.roomtab[href*="calcdex"]');const r=e?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height};})()`);
    assert.ok(calcTab,'Calcdex navigation tab is available');assert.deepEqual(maskedPixel(frame,map,calcTab),maskedPixel(original,map,calcTab),'Calcdex navigation remains visible when the calculator is hidden');
    assert.ok(!('image' in frame.client),'Mirror sends pixels without image compression');
    if(config.moves&&config.showdex){assert.ok(Buffer.from(frame.client.pixels).equals(pixels(frame)),'All-on mirror equals the original captured pixels');}
    reports.push({version,config,move,calculator});
   }
   visibility={hub:false,showdex:false,moves:false};stream.invalidate();await ready();
   fs.writeFileSync(path.join(out,version+'-mirror-hidden.png'),(await stream.window.webContents.capturePage()).toPNG());
   assert.ok(await sourceRun(`document.getElementById('room-${id}').textContent.includes('Dragon Pulse')`),'Controls retained locally');
   // A private UI change DURING a capture must drop that frame, not expose it.
   clearTimeout(stream.timer);while(stream.cycle===stream.generation)await pause(5);clearTimeout(stream.timer);stream.prefetch=null;stream.latest=null;stream.pendingSequence=0;barrier=()=>sourceRun("document.getElementById('mirror-showdex-marker').style.left='420px';void 0;");await stream.tick(stream.generation);
   assert.equal(barrier,null,'Race test captured a real frame');
   const raceMap=await sourceRun(`(${collectMirrorMap})(${JSON.stringify(visibility)})`);
   assert.notDeepEqual(maskedPixel(stream.lastFrame,raceMap,rects[1]),[255,0,255,255],'A stale capture never exposes the calculator at its earlier position');
   clearTimeout(stream.timer);await stream.tick(stream.generation);await ready();
   await sourceRun("document.getElementById('mirror-move-marker').remove();document.getElementById('mirror-showdex-marker').remove();void 0;");
   stream.invalidate();await ready();
   const panel=await sourceRun(`(()=>{const e=document.getElementById('room-${id}').querySelector('.battle-controls');const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,color:s.backgroundColor};})()`);
   const styledMap=await sourceRun(`(${collectMirrorMap})(${JSON.stringify(visibility)})`),styledFrame=stream.lastFrame;
   assert.equal(panel.color,'rgb(23, 43, 59)','Source uses Pro control-panel styling');
   assert.ok(styledMap.masks.some(mask=>mask.color?.join(',')==='23,43,59,255'),'Hidden choices use the exact Pro panel fill');
   for(const dx of [10,40,80,130,160,200])for(const dy of [5,10,20,30])assert.deepEqual(maskedPixel(styledFrame,styledMap,{x:panel.x+panel.width-dx,y:panel.y+dy,width:1,height:1}),[59,43,23,255],'Calcdex/timer wrappers leave no darker patches in the hidden Pro panel');
   const sourceFrame={client:{...styledFrame.client,pixels:pixels(styledFrame)}};
   for(const point of [{x:panel.x+panel.width/2,y:panel.y,width:1,height:0.5},{x:panel.x+panel.width+1,y:panel.y+20,width:1,height:1}])assert.deepEqual(maskedPixel(styledFrame,styledMap,point),maskedPixel(sourceFrame,styledMap,point),'Panel border and neighboring chat pixels are untouched');
   fs.writeFileSync(path.join(out,version+'-mirror-pro-controls.png'),(await stream.window.webContents.capturePage()).toPNG());
   // Real Pokémon tooltips follow their own switch in both clients, including
   // when their popup overlaps the otherwise-hidden player control panel.
   for(const kind of ['pokemon','activepokemon','switchpokemon']){
    await sourceRun(`(()=>{const room=${host}.rooms[${JSON.stringify(id)}],tips=room.tooltips||new BattleTooltips(room.battle),anchors=[...document.getElementById('room-${id}').querySelectorAll('[data-tooltip^="${kind}|"]')];if(!anchors.some(anchor=>tips.showTooltip(anchor)))throw Error('Missing populated ${kind} hover target');})();void 0;`);
    await wait(()=>sourceRun(`!!document.querySelector('.tooltip-${kind}')`),'Real '+kind+' tooltip');
    for(const config of [{hub:false,showdex:false,moves:true,tooltips:false},{hub:false,showdex:false,moves:false,tooltips:true}]){
     visibility=config;stream.invalidate();await ready();const map=await sourceRun(`(${collectMirrorMap})(${JSON.stringify(config)})`),frame=stream.lastFrame;
     const popup=await sourceRun(`(()=>{const r=document.querySelector('.tooltip-${kind}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
     const original={client:{...frame.client,pixels:pixels(frame)}};
     if(config.tooltips){assert.deepEqual(maskedPixel(frame,map,popup),maskedPixel(original,map,popup),'Pokémon details remain visible while moves and Showdex are hidden');assert.ok(map.reveals.length,'Only opted-in Pokémon tooltip bounds are revealed');}
     else assert.ok(map.masks.some(r=>r.x<=popup.x&&r.y<=popup.y&&r.x+r.width>=popup.x+popup.width&&r.y+r.height>=popup.y+popup.height),'Pokémon tooltip stays hidden even when move controls are visible');
    }
    if(kind==='activepokemon'){
     await sourceRun(`(()=>{const e=document.querySelector('.tooltip-activepokemon');e.style.position='fixed';e.style.left='20px';e.style.top='${panel.y+20}px';e.style.bottom='auto';e.style.margin='0';})();void 0;`);
     stream.invalidate();await ready();const map=await sourceRun(`(${collectMirrorMap})(${JSON.stringify(visibility)})`),frame=stream.lastFrame,popup=await sourceRun("(()=>{const r=document.querySelector('.tooltip-activepokemon').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
     const bounds=maskRectangles([popup],map,{width:frame.client.width,height:frame.client.height})[0],original=pixels(frame);
     const displayed=Buffer.from(frame.client.pixels);for(let y=0;y<bounds.height;y++){const offset=((bounds.y+y)*frame.client.width+bounds.x)*4;assert.ok(displayed.subarray(offset,offset+bounds.width*4).equals(original.subarray(offset,offset+bounds.width*4)),'Allowed hover popup matches the original over hidden controls');}
     assert.deepEqual(maskedPixel(frame,map,{x:panel.x+panel.width-20,y:panel.y+60,width:1,height:1}),[59,43,23,255],'Choices outside the allowed popup remain covered');
     fs.writeFileSync(path.join(out,version+'-mirror-pokemon-tooltip.png'),(await stream.window.webContents.capturePage()).toPNG());
    }
    await sourceRun('BattleTooltips.hideTooltip();void 0;');
   }
   await sourceRun(`(()=>{const room=${host}.rooms[${JSON.stringify(id)}],anchor=document.getElementById('room-${id}').querySelector('[data-tooltip^="move|"]');(room.tooltips||new BattleTooltips(room.battle)).showTooltip(anchor);})();void 0;`);
   await wait(()=>sourceRun("!!document.querySelector('.tooltip-move')"),'Real move tooltip');stream.invalidate();await ready();
   assert.equal((await sourceRun(`(${collectMirrorMap})(${JSON.stringify(visibility)})`)).reveals.length,0,'Allowing Pokémon details never reveals move tooltips');
   await sourceRun('BattleTooltips.hideTooltip();void 0;');visibility={hub:false,showdex:false,moves:false,tooltips:false};stream.invalidate();await ready();
   await sourceRun(`${host}.receive(${JSON.stringify('>'+id+'\n|win|ProTest')});${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);void 0;`);
   await wait(()=>sourceRun(`!!${host}.rooms[${JSON.stringify(id)}].battle.ended`),'Battle ended');stream.invalidate();await ready();
   const replay=await sourceRun(`(()=>{const e=document.getElementById('room-${id}').querySelector('[name="instantReplay"],[data-cmd="/play"]');const r=e?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height};})()`);
   assert.ok(replay,'Replay button is present after battle');const replayMap=await sourceRun(`(${collectMirrorMap})(${JSON.stringify(visibility)})`),replayFrame=stream.lastFrame;
   assert.deepEqual(maskedPixel(replayFrame,replayMap,replay),maskedPixel({client:{...replayFrame.client,pixels:pixels(replayFrame)}},replayMap,replay),'Public replay controls keep their original Pro pixels');
   fs.writeFileSync(path.join(out,version+'-mirror-replay-controls.png'),(await stream.window.webContents.capturePage()).toPNG());
   await sourceRun(version==='old'?"app.addRoom('teambuilder');app.focusRoom('teambuilder');void 0;":"PS.join('teambuilder');PS.focusRoom('teambuilder');PS.update();void 0;");
   await wait(()=>sourceRun("document.getElementById('room-teambuilder')?.checkVisibility()"),'Actual Teambuilder panel active');stream.invalidate();await ready();
   fs.writeFileSync(path.join(out,version+'-mirror-teambuilder.png'),(await stream.window.webContents.capturePage()).toPNG());
   assert.ok(await sourceRun("/New team/i.test(document.getElementById('room-teambuilder').textContent)"),'Real Teambuilder content visible');
   await sourceRun(`${host}.receive('>mirrorchat\\n|init|chat\\n|title|Mirror chat\\n|c| Viewer|The whole app is mirrored');${host}.focusRoom('mirrorchat');${version==='new'?'PS.update();':''}void 0;`);
   await wait(()=>sourceRun("document.getElementById('room-mirrorchat')?.checkVisibility()"),'Actual chat room active');stream.invalidate();await ready();
   fs.writeFileSync(path.join(out,version+'-mirror-lobby.png'),(await stream.window.webContents.capturePage()).toPNG());
   for(const zoom of [0.75,1.5]){source.webContents.setZoomFactor(zoom);stream.invalidate();await ready();assert.ok(stream.lastFrame.client.width>0,'Live zoom still mirrored');}source.webContents.setZoomFactor(1);
   for(const size of [[900,1300],[1400,900]]){source.setContentSize(...size);stream.window.setContentSize(...size);stream.invalidate();await ready();}
   // Exercise the reported maximized resolution with all components visible.
   visibility={hub:true,showdex:true,moves:true,tooltips:true,teras:true};source.setContentSize(1560,1008);hub.setContentSize(360,1008);stream.window.setContentSize(1920,1008);stream.interval=1000/60;stream.invalidate();await ready();
   await sourceRun("(()=>{const marker=document.createElement('div');marker.id='mirror-live-counter';marker.textContent='Live 0';marker.style='position:fixed;left:10px;bottom:10px;width:64px;height:20px;padding-left:8px;background:#12abcd;color:white;z-index:999999';document.body.append(marker);let n=0;window.__mirrorLiveTimer=setInterval(()=>{window.__mirrorCounter=++n;marker.firstChild.data='Live '+n;marker.style.backgroundColor='rgb('+(n%256)+',111,77)';},33);})();void 0;");
   const baseline=stream.stats.painted,sentBaseline=stream.stats.sent,started=Date.now();await pause(2500);const fps=(stream.stats.painted-baseline)*1000/(Date.now()-started);
   assert.ok(stream.stats.painted>baseline,'Live frames continue arriving');
   assert.ok((stream.stats.sent-sentBaseline)-(stream.stats.painted-baseline)<=2,'Frames never build up behind the renderer');
   const counter=await sourceRun("(()=>{const r=document.getElementById('mirror-live-counter').getBoundingClientRect();return {value:window.__mirrorCounter,x:r.x+2,y:r.y+2,width:innerWidth,height:innerHeight};})()");
   const live=stream.lastFrame.client,offset=(Math.floor(counter.y*live.height/counter.height)*live.width+Math.floor(counter.x*live.width/counter.width))*4;
   const shown=live.pixels[offset+(live.format==='bgra'?2:0)],age=(counter.value%256-shown+256)%256;
   assert.ok(age<=16,'Mirror remains current instead of displaying old queued screenshots: '+age+' ticks');
   const edges=await stream.window.webContents.executeJavaScript("(()=>{const r=document.getElementById('mirror').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};})()");
   const caption=process.platform==='win32'?32:0;
   assert.equal(edges.x,0);assert.equal(edges.y,caption);assert.equal(edges.width,edges.viewportWidth);assert.equal(edges.height,edges.viewportHeight-caption);
   assert.ok(stream.lastFrame.hub,'The requested Hub stays included during live capture');
   fs.writeFileSync(path.join(out,version+'-mirror-full-window.png'),(await stream.window.webContents.capturePage()).toPNG());
   const renderer=await stream.window.webContents.executeJavaScript('window.__streamStats.renderer');
   reports.push({version,fps,renderer,edges,age});console.log(version+': full-HD mirror '+fps.toFixed(1)+' fps ('+renderer+'); '+age+' ticks behind; Hub included; no added margins.');
   await sourceRun("clearInterval(window.__mirrorLiveTimer);document.getElementById('mirror-live-counter').remove();void 0;");stream.interval=100;source.setContentSize(1400,900);stream.window.setContentSize(1400,900);visibility={hub:false,showdex:false,moves:false};stream.invalidate();
   console.log(version+': full app mirror, real controls retained, independent visibility, original pixel match, private-overlay race, Teambuilder/lobby, zoom and resizing passed.');
  }
  await source.webContents.loadURL('data:text/html,<body style="background:orange">A different app page</body>');stream.invalidate();await ready();assert.equal(stream.lastFrame.hub,null);console.log('Non-battle navigation mirrors the current page; renderer is isolated and muted.');
  fs.writeFileSync(path.join(out,'mirror-results.json'),JSON.stringify(reports,null,2));
 }catch(error){
  fs.writeFileSync(path.join(out,'failure.log'),error.stack||String(error));
  try{fs.writeFileSync(path.join(out,'failure-state.json'),JSON.stringify(await sourceRun(`({width:innerWidth,height:innerHeight,showdex:window.__SHOWDEX_INIT,rooms:Object.keys((window.app||window.PS)?.rooms||{}),tabs:[...document.querySelectorAll('a.roomtab,[id^="roomtab-"]')].map(e=>({id:e.id,href:e.getAttribute('href'),text:e.textContent})),battles:Object.entries((window.app||window.PS)?.rooms||{}).filter(([,r])=>r.battle).map(([id,r])=>({id,overlay:r.battle.calcdexAsOverlay}))})`),null,2));}catch{}
  for(const [name,contents] of [['player',source.webContents],['stream',stream.window?.webContents]])if(contents&&!contents.isDestroyed())try{fs.writeFileSync(path.join(out,name+'-failure.png'),(await contents.capturePage()).toPNG());}catch{}
  throw error;
 }
 finally{stream.destroy();source.destroy();hub.destroy();}
}).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
