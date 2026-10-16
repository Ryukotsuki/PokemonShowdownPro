require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,protocol,net,desktopCapturer}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {StreamerStream}=require('../app/streamer-mode.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/streamer-minimize');
app.setPath('userData',path.join(out,'profile'));
protocol.registerSchemesAsPrivileged([{scheme:'showdown-pro',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
setTimeout(()=>{console.error('Stream minimize audit timed out');app.exit(1);},60000).unref();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});
 if(process.platform!=='win32'){console.log('Windows capture backgrounding audit skipped on '+process.platform);app.exit(0);return;}
 const ses=session.fromPartition('pro-streamer-stream');
 ses.protocol.handle('showdown-pro',req=>{
  const url=new URL(req.url),base=path.join(root,'app/stream'),file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
  if(url.hostname!=='stream'||!file.startsWith(base+path.sep))return new Response('',{status:403});
  return net.fetch(pathToFileURL(file).href);
 });
 const source=new BrowserWindow({show:false,width:800,height:600,focusable:false,webPreferences:{backgroundThrottling:false}});
 source.setSkipTaskbar(true);source.setOpacity(0.01);source.showInactive();
 await source.loadURL('data:text/html,'+encodeURIComponent('<body style="margin:0;background:#12abcd;color:white;font:48px Arial"><h1>Live stream audit</h1><div id="counter">0</div><script>let n=0;setInterval(()=>{document.getElementById("counter").firstChild.data=String(++n);document.body.style.backgroundColor="rgb("+(40+n%140)+",111,180)";},40)</script>'));
 const stream=new StreamerStream({createWindow:options=>new BrowserWindow({...options,focusable:false}),contents:()=>source.webContents,backgroundWindow:()=>source,visibility:()=>({hub:false,showdex:true,moves:true,tooltips:true,teras:true})});
 const wait=async test=>{for(let i=0;i<100;i++){if(await test())return;await pause(50);}throw Error('Stream did not resume drawing');};
 const capture=async action=>{let error;for(let i=0;i<5;i++){try{return await action();}catch(value){error=value;await pause(100);}}throw error;};
 let step='opening';
 try{
  await stream.open();const win=stream.window;win.setSkipTaskbar(true);win.setOpacity(0.01);win.showInactive();
  await wait(()=>stream.stats.painted>3);
  assert.equal(win.getTitle(),'Showdown Pro Stream');assert.equal(await win.webContents.getTitle(),'Showdown Pro Stream');
  assert.equal(win.isMinimizable(),false,'Native taskbar/system-menu minimize is disabled');
  assert.equal(await win.webContents.executeJavaScript('document.getElementById("caption").hidden'),false);
  const click=async id=>{
   const point=await win.webContents.executeJavaScript(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
   win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
   win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
  };
  let nativeMinimizes=0,navigations=0;win.on('minimize',()=>nativeMinimizes++);win.webContents.on('did-finish-load',()=>navigations++);
  const id=win.getMediaSourceId(),reports=[];
  for(const mode of ['normal','maximized','client-minimized','repeated']){
   step=mode;
   if(mode==='maximized'){await click('maximize');await wait(()=>win.isMaximized());}
   if(mode==='client-minimized'){win.unmaximize();source.minimize();await pause(100);}
   const before=stream.stats.painted,sequence=stream.lastFrame?.sequence||0;
   for(let i=0;i<(mode==='repeated'?5:1);i++){await click('minimize');await pause(100);}
   assert.equal(win.isMinimized(),false,'Stream remains a non-iconic OBS capture target');
   assert.equal(win.isVisible(),true);assert.equal(win.getMediaSourceId(),id,'Capture handle stays stable');
   assert.equal(source.isMinimized(),false,'Client stays above the capture window');
   assert.equal(nativeMinimizes,0,'Minimize button never enters native minimization');
   assert.equal(navigations,0,'Backgrounding does not reload or clear the picture');
   await wait(()=>stream.stats.painted>=before+5&&(stream.lastFrame?.sequence||0)>sequence&&!stream.displayRestart);
   const image=await capture(()=>win.webContents.capturePage()),bitmap=image.toBitmap();
   const colors=new Set();for(let i=0;i<bitmap.length;i+=4*97)colors.add(bitmap.readUInt32LE(i));
   assert.ok(colors.size>8,'Stream contains the source image, not just the blue clear color: '+colors.size);
   fs.writeFileSync(path.join(out,mode+'.png'),image.toPNG());
   const windows=await capture(()=>desktopCapturer.getSources({types:['window'],thumbnailSize:{width:320,height:180}})),target=windows.find(window=>window.id===id);
   assert.ok(target&&!target.thumbnail.isEmpty(),'Stream remains discoverable by desktop window capture');
   reports.push({mode,id,title:win.getTitle(),painted:stream.stats.painted-before,sequence:stream.lastFrame.sequence,thumbnail:target.thumbnail.getSize(),maximized:win.isMaximized()});
  }
  // Reproduce a silent graphics-state failure: the previous renderer kept
  // acknowledging frames after a failed draw, leaving only its blue clear.
  if(await win.webContents.executeJavaScript('window.__streamStats.renderer==="webgl"')){
   step='graphics-failure';
   await win.webContents.executeJavaScript(`(()=>{const graphics=document.getElementById('mirror').getContext('webgl');graphics.deleteProgram(graphics.getParameter(graphics.CURRENT_PROGRAM));graphics.useProgram(null);})();`);
   await wait(()=>win.webContents.executeJavaScript('window.__streamStats?.renderer==="2d"&&!document.getElementById("mirror").hidden').catch(()=>false));
   console.log('Silent WebGL failure recovered with a complete frame through the 2D fallback.');
  }
  // Drop one acknowledgement completely. Reload must break the blocked
  // delivery queue and resend a full image, without changing the HWND.
  let reloaded=false;const acknowledge=stream.acknowledge;
  win.webContents.once('did-finish-load',()=>{reloaded=true;stream.acknowledge=acknowledge;});
  step='lost-ack';
  stream.acknowledge=()=>{};
  await wait(()=>reloaded);await wait(()=>win.webContents.executeJavaScript('window.__streamStats?.frames>3&&!document.getElementById("mirror").hidden').catch(()=>false));
  const recovered=await capture(()=>win.webContents.capturePage()),recoveredBytes=recovered.toBitmap(),recoveredColors=new Set();
  for(let i=0;i<recoveredBytes.length;i+=4*97)recoveredColors.add(recoveredBytes.readUInt32LE(i));
  assert.ok(recoveredColors.size>8,'Lost-ack recovery restores the picture');
  assert.equal(win.getMediaSourceId(),id);fs.writeFileSync(path.join(out,'recovered.png'),recovered.toPNG());
  const beforeOpen=navigations;
  await stream.open();assert.equal(stream.window,win,'Show stream window reuses the same capture target');assert.equal(navigations,beforeOpen,'Reopening keeps the current viewer alive');
  await wait(()=>win.webContents.executeJavaScript('window.__streamStats?.frames>3').catch(()=>false));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));
  await click('close');await wait(()=>win.isDestroyed());assert.equal(stream.window,null,'Caption close still closes the stream');
  console.log('Showdown Pro Stream: actual caption buttons keep a live picture without native minimize or navigation; normal/maximized/client-minimized/repeated, reopen and close passed.');
 }catch(error){console.error('Step: '+step);console.error(await stream.window?.webContents.executeJavaScript('({url:location.href,stats:window.__streamStats,hidden:document.getElementById("mirror")?.hidden})').catch(()=>null));throw error;}
 finally{stream.destroy();source.destroy();}
 app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
