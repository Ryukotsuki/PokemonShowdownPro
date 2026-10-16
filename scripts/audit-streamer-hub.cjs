const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({window,root,state,waitFor,getStream,getMirror,preferencesFile})=>{
 // WebContentsView needs a compositor surface for pixel capture. Paint this
 // muted audit window almost transparently without taking focus. A fully zero
 // opacity window can lose its child view's compositor surface on Windows.
 window.setSkipTaskbar(true);window.setOpacity(0.01);window.showInactive();
 const panel=window.webContents,run=code=>panel.executeJavaScript(`(async()=>{${code}})()`);
 await run("await pro.setSetting('sidebarTab','battle');await pro.setSetting('sidebarCollapsed',false);await pro.setSetting('streamerEnabled',false);");
 for(const key of ['streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])await run(`await pro.setSetting('${key}',false);`);
 assert.equal(await run('return document.getElementById("streamer-mode").checked;'),false);
 await run('document.getElementById("streamer-open").click();');
 await waitFor(()=>state().settings.streamerEnabled&&state().ui.streamerWindowOpen);
 await waitFor(()=>run('return document.getElementById("streamer-mode").checked;'));
 assert.equal(JSON.parse(fs.readFileSync(preferencesFile)).streamerEnabled,true);
 const stream=getStream();assert.equal(stream.webContents.isAudioMuted(),true);
 const captureStream=async()=>{let error;for(let i=0;i<5;i++){try{return await stream.webContents.capturePage();}catch(value){error=value;await new Promise(resolve=>setTimeout(resolve,100));}}throw error;};
 assert.equal(await stream.webContents.executeJavaScript('typeof pro'), 'undefined');
 assert.equal(await stream.webContents.executeJavaScript('typeof stream.start'),'function');
 await waitFor(()=>stream.webContents.executeJavaScript('!document.getElementById("mirror").hidden'));
 const withoutHub=await stream.webContents.executeJavaScript('document.getElementById("mirror").width/document.getElementById("mirror").height');
 for(const [id,key] of [['streamer-show-hub','streamerShowHub'],['streamer-show-showdex','streamerShowShowdex'],['streamer-show-moves','streamerShowMoves'],['streamer-show-pokemon-tooltips','streamerShowPokemonTooltips'],['streamer-show-teras','streamerShowTeras']]){
  assert.equal(await run(`return document.getElementById('${id}').checked;`),false);
  await run(`const input=document.getElementById('${id}');input.checked=true;input.dispatchEvent(new Event('change'));`);
  await waitFor(()=>state().settings[key]===true);
  assert.equal(JSON.parse(fs.readFileSync(preferencesFile))[key],true);
  if(key==='streamerShowHub'){
   await waitFor(async()=>await stream.webContents.executeJavaScript('!document.getElementById("mirror").hidden&&document.getElementById("mirror").width/document.getElementById("mirror").height')>withoutHub);
   const out=path.join(root,'test-results/streamer-mode');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mirror-with-real-hub.png'),(await stream.webContents.capturePage()).toPNG());
  }
  await run(`await pro.setSetting('${key}',false);`);
 }
 for(const key of ['streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])await run(`await pro.setSetting('${key}',true);`);
 window.setContentSize(1920,1008);stream.setContentSize(1920,1008);
 const mirror=getMirror(),client=mirror.contents();
 const foulPlay=state().settings.foulPlayEnabled;if(foulPlay!==undefined)await run("await pro.setSetting('foulPlayEnabled',false);");
 const {history,request}=require('../tests/fixtures.cjs'),battleId='battle-gen9randombattle-998951';
 await client.executeJavaScript(`(()=>{const host=window.app||window.PS;if(window.app){app.socket.send=()=>{};app.user.set({name:'ProTest',named:true});Storage.prefs('autotimer',false);}else{PS.connection.send=()=>{};PS.user.setName('ProTest',true,'1');PS.prefs.set('autotimer',false);}host.receive(${JSON.stringify('>'+battleId+'\n'+history().filter(line=>!line.startsWith('|request|')).join('\n'))});host.receive(${JSON.stringify('>'+battleId+'\n|request|'+JSON.stringify(request()))});host.focusRoom('${battleId}');})();void 0;`);
 await waitFor(()=>client.executeJavaScript(`!!(window.app||window.PS).rooms['${battleId}']?.battle`));
 await client.executeJavaScript(`(window.app||window.PS).rooms['${battleId}'].battle.seekTurn(Infinity);void 0;`);
 await waitFor(()=>client.executeJavaScript(`document.getElementById('room-${battleId}').textContent.includes('Dragon Pulse')`));
 // Exercise the actual WebContentsView and default hidden controls, rather
 // than just checking that a simple test window emits nonblack pixels.
 if(process.platform==='win32'){
  const focusable=stream.isFocusable();stream.setFocusable(false);stream.setSkipTaskbar(true);stream.setOpacity(0.01);stream.showInactive();
  for(const shown of [false,true]){
   for(const key of ['streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])await run(`await pro.setSetting('${key}',${shown});`);
   await waitFor(()=>stream.webContents.executeJavaScript('!document.getElementById("mirror").hidden'));
   for(const mode of ['normal','maximized','reopened']){
    if(mode==='maximized')stream.maximize();
    const before=getMirror().stats.painted;
    await stream.webContents.executeJavaScript('document.getElementById("minimize").click();');await new Promise(resolve=>setTimeout(resolve,250));
    if(mode==='reopened')await run('await pro.openStreamerStream();');
    await waitFor(()=>getMirror().stats.painted>before+5);
    const image=await captureStream(),bytes=image.toBitmap(),colors=new Set();
    for(let i=0;i<bytes.length;i+=4*97)colors.add(bytes.readUInt32LE(i));
    fs.writeFileSync(path.join(root,'test-results/streamer-mode',`native-${shown?'shown':'masked'}-minimize-${mode}.png`),image.toPNG());
    assert.ok(colors.size>50,'Actual battle remains visible after '+mode+' minimize: '+colors.size+' colors');
    assert.equal(stream.isMinimized(),false);assert.equal(stream.getTitle(),'Showdown Pro Stream');
   }
   stream.unmaximize();
  }
  stream.setFocusable(focusable);
  console.log('Native battle pixels and fresh frames survive minimize/maximize/reopen, with controls hidden and visible.');
 }
 await client.executeJavaScript("(()=>{const marker=document.createElement('div');marker.id='mirror-native-counter';marker.textContent='Live 0';marker.style='position:fixed;left:8px;bottom:8px;min-width:64px;height:20px;padding-left:8px;background:#12abcd;color:white;z-index:999999';document.body.append(marker);let n=0;window.__mirrorNativeRunning=true;const animate=()=>{if(!window.__mirrorNativeRunning)return;window.__mirrorNativeValue=++n;marker.firstChild.data='Live '+n;marker.style.backgroundColor='rgb('+(n%256)+','+((n>>8)%256)+','+((n>>16)%256)+')';window.__mirrorNativeTimer=requestAnimationFrame(animate);};animate();})();void 0;");
 await waitFor(()=>stream.webContents.executeJavaScript('!document.getElementById("mirror").hidden'));
 const point=await client.executeJavaScript("(()=>{const r=document.getElementById('mirror-native-counter').getBoundingClientRect();return {x:r.x+2,y:r.y+2,width:innerWidth,height:innerHeight};})()"),originalOnFrame=mirror.onFrame;let unique=0,lastValue;
 mirror.onFrame=image=>{originalOnFrame(image);const part=mirror.lastFrame?.client;if(!part)return;const offset=(Math.floor(point.y*part.height/point.height)*part.width+Math.floor(point.x*part.width/point.width))*4,b=part.pixels,value=part.format==='bgra'?b[offset+2]+(b[offset+1]<<8)+(b[offset]<<16):b[offset]+(b[offset+1]<<8)+(b[offset+2]<<16);if(value!==lastValue){unique++;lastValue=value;}};
 const reports=[],output=path.join(root,'test-results/streamer-mode');fs.mkdirSync(output,{recursive:true});
 for(const masked of [false,true,false]){
  for(const key of ['streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])await run(`await pro.setSetting('${key}',${!masked});`);
  await waitFor(()=>stream.webContents.executeJavaScript('!document.getElementById("mirror").hidden'));await new Promise(resolve=>setTimeout(resolve,500));
  const painted=mirror.stats.painted,sent=mirror.stats.sent,uniqueStart=unique,sourceStart=await client.executeJavaScript('window.__mirrorNativeValue'),started=performance.now();await new Promise(resolve=>setTimeout(resolve,3000));const elapsed=performance.now()-started;
  const fps=(mirror.stats.painted-painted)*1000/elapsed,uniqueFps=(unique-uniqueStart)*1000/elapsed,sourceEnd=await client.executeJavaScript('window.__mirrorNativeValue'),sourceFps=(sourceEnd-sourceStart)*1000/elapsed,age=sourceEnd-lastValue;
  assert.ok(age<=Math.max(8,Math.ceil(sourceFps*0.06)),'Live counter stays current, not buffered: '+age);assert.ok((mirror.stats.sent-sent)-(mirror.stats.painted-painted)<=2,'Only one drawing frame and one latest replacement may be outstanding');
  console.log('Actual Pro window'+(masked?' (streamer masks)':' (all visible)')+': '+fps.toFixed(1)+' fps; '+uniqueFps.toFixed(1)+' distinct updates/s; source '+sourceFps.toFixed(1)+' fps; '+age+' frames behind.');
  reports.push({masked,fps,uniqueFps,sourceFps,age,stats:structuredClone(mirror.stats),draw:await stream.webContents.executeJavaScript('window.__streamStats')});
  fs.writeFileSync(path.join(output,masked?'native-mirror-masked.png':'native-mirror-full.png'),(await stream.webContents.capturePage()).toPNG());
 }
 mirror.onFrame=originalOnFrame;fs.writeFileSync(path.join(output,'native-mirror-performance.json'),JSON.stringify(reports,null,2));
 await client.executeJavaScript("window.__mirrorNativeRunning=false;cancelAnimationFrame(window.__mirrorNativeTimer);document.getElementById('mirror-native-counter').remove();void 0;");
 if(await stream.webContents.executeJavaScript("!!document.getElementById('mirror').getContext('webgl')?.getExtension('WEBGL_lose_context')")){
  let restored=false;stream.webContents.once('did-finish-load',()=>{restored=true;});
  await stream.webContents.executeJavaScript("(()=>{const extension=document.getElementById('mirror').getContext('webgl').getExtension('WEBGL_lose_context');extension.loseContext();setTimeout(()=>extension.restoreContext(),100);})();void 0;");
  await waitFor(()=>restored);await waitFor(()=>stream.webContents.executeJavaScript("!document.getElementById('mirror').hidden&&window.__streamStats.frames>0"));
  console.log('Streamer renderer recovered after graphics context loss with a fresh complete frame.');
 }
 if(foulPlay!==undefined)await run(`await pro.setSetting('foulPlayEnabled',${foulPlay});`);
 for(const key of ['streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])await run(`await pro.setSetting('${key}',false);`);
 await run('const input=document.getElementById("streamer-mode");input.checked=false;input.dispatchEvent(new Event("change"));');
 await waitFor(()=>!state().settings.streamerEnabled&&!state().ui.streamerWindowOpen);
 assert.equal(JSON.parse(fs.readFileSync(preferencesFile)).streamerEnabled,false);
 await run("await pro.openStreamerStream();");getStream().close();
 await waitFor(()=>!state().settings.streamerEnabled&&!state().ui.streamerWindowOpen);
 assert.equal(JSON.parse(fs.readFileSync(preferencesFile)).streamerEnabled,false);
 const out=path.join(root,'test-results/streamer-mode');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'battle-hub.png'),(await panel.capturePage()).toPNG());
 console.log('Streamer mode Battle Hub: button, toggle, persistence, private IPC isolation and window-close synchronization passed.');
};
