require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,nativeTheme}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {loadAuditClient,isolateAuditNetwork}=require('./audit-client.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/settings-scrollbar');
app.setPath('userData',path.join(out,'profile'));app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
setTimeout(()=>{console.error('Settings scrollbar audit timed out');app.exit(1);},90000).unref();
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});const ses=session.fromPartition('settings-scrollbar');isolateAuditNetwork(ses);
 const win=new BrowserWindow({show:false,width:1920,height:1080,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
 const run=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<200;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw Error('Timed out: '+code);};
 await loadAuditClient(wc,'https://play.pokemonshowdown.com/oldclient');wc.setZoomFactor(1.45);
 await wait('window.app?.socket?.readyState===1 && window.OptionsPopup');
 await run("app.socket.send=()=>{};app.user.set({name:'ProTest',named:true});");
 await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8'));
 const css=require('../app/client-theme-css.cjs');await wc.insertCSS(css,{cssOrigin:'user'});await wc.insertCSS(css);
 const report=[];
 for(const zoom of [1,1.45]){
  wc.setZoomFactor(zoom);
  await run("app.closePopup();app.addPopup(OptionsPopup,{sourceEl:document.querySelector('[name=openOptions]')});");
  for(const [theme,system] of [['light','light'],['dark','dark'],['pro','dark'],['system','light'],['system','dark']]){
   nativeTheme.themeSource=system;
   await run(`OptionsPopup.prototype.setTheme({currentTarget:{value:'${theme}'}});`);await pause(150);
   const label=theme==='system'?'system-'+system:theme;
   const metrics=await run(`const root=document.scrollingElement,popup=document.querySelector('.ps-popup select[name=theme]').closest('.ps-popup');return {scrollHeight:root.scrollHeight,clientHeight:root.clientHeight,scrollbar:getComputedStyle(root).scrollbarColor,track:getComputedStyle(root,'::-webkit-scrollbar-track').backgroundColor,popup:getComputedStyle(popup).backgroundColor};`);
   if(theme!=='pro'&&system==='dark'){
    assert.equal(metrics.scrollbar,'rgb(108, 108, 111) rgb(13, 21, 30)','Old Dark settings has an opaque track matching the popup');
    assert.equal(metrics.popup,'rgb(13, 21, 30)');
   }else{
    assert.equal(metrics.scrollbar,'auto','Native Light and Pro keep their own scrollbar styling');
    if(theme==='pro')assert.equal(metrics.track,'rgb(16, 38, 53)','Pro keeps its blue track');
   }
   if(zoom===1.45)assert.ok(metrics.scrollHeight>metrics.clientHeight,'Settings uses the actual document scrollbar at 145%');
   report.push({zoom,theme:label,...metrics});
   fs.writeFileSync(path.join(out,'old-settings-'+label+'-'+Math.round(zoom*100)+'.png'),(await wc.capturePage()).toPNG());
  }
  await run('app.closePopup();');
  assert.equal(await run('return getComputedStyle(document.documentElement).scrollbarColor;'),'auto','Dark scrollbar override ends when settings closes');
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('Old-client settings scrollbar passed in Dark, Light, Pro and System at 100%/145%; closes cleanly.');app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
