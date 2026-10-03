// Hold a page resource open to verify styling before the load event, using
// the production sandboxed preload and real upstream styles on every OS.
require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,ipcMain,nativeTheme}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let win,release;
const timeout=setTimeout(()=>{console.error('Startup theme audit timed out');app.exit(1);},30000);
app.whenReady().then(async()=>{
  const ses=session.fromPartition('startup-theme-audit-'+Date.now());
  ses.protocol.handle('https',async request=>{
    const url=new URL(request.url);
    assert.equal(url.hostname,'play.pokemonshowdown.com');
    if(url.pathname==='/slow-resource') {
      await new Promise(resolve=>{release=resolve;});
      return new Response('',{status:404});
    }
    if(!['/newclient','/oldclient','/'].includes(url.pathname))return new Response('',{status:404});
    const client=url.pathname==='/oldclient'?'old':'new';
    const css=fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style',client==='new'?'client2.css':'oldclient.css'),'utf8');
    return new Response(`<!doctype html><html><head>${client==='new'?'<link rel="stylesheet" href="/style/client2.css">':''}<style>${css}</style></head><body class="light"><div class="ps-room"><button class="button">Battle!</button></div><img src="/slow-resource"></body></html>`,{headers:{'content-type':'text/html'}});
  });
  ipcMain.handle('client:theme-css',event=>{
    assert.equal(event.sender,win.webContents);
    assert.equal(event.senderFrame,event.sender.mainFrame);
    assert.equal(new URL(event.senderFrame.url).origin,'https://play.pokemonshowdown.com');
    return require('../app/client-theme-css.cjs');
  });
  win=new BrowserWindow({show:false,width:720,height:450,webPreferences:{session:ses,
    preload:path.join(root,'app/client-preload.cjs'),contextIsolation:true,sandbox:true,
    nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
  const wc=win.webContents;
  for(const client of ['oldclient','newclient','']) {
    for(const choice of ['pro','light','dark','system']) {
      if(wc.getURL())await wc.executeJavaScript(`localStorage.setItem('showdown_prefs',${JSON.stringify(choice==='pro'?'{}':JSON.stringify({theme:choice,showdownProThemeVersion:1,avatar:'preserved'}))});`);
      nativeTheme.themeSource='light';
      let loaded=false;
      const dom=new Promise(resolve=>wc.once('dom-ready',resolve));
      const navigation=wc.loadURL('https://play.pokemonshowdown.com/'+client).then(()=>{loaded=true;});
      navigation.catch(()=>{});
      await dom;
      let frameTimer;
      try {
        assert.equal(await Promise.race([
          wc.mainFrame.executeJavaScript('document.readyState !== "loading"'),
          new Promise((_,reject)=>{frameTimer=setTimeout(()=>reject(new Error('Main-frame scripts waited for the slow resource')),2000);})
        ]),true);
      } finally {clearTimeout(frameTimer);}
      if(!wc.debugger.isAttached())wc.debugger.attach('1.3');
      const evaluate=async expression=>(await wc.debugger.sendCommand('Runtime.evaluate',{expression,returnByValue:true})).result.value;
      let state;
      for(let n=0;n<100;n++) {
        state=await evaluate(`(()=>{const r=document.documentElement,s=getComputedStyle(document.body);return {pro:r.classList.contains('showdown-pro'),dark:r.classList.contains('dark'),bodyDark:document.body.classList.contains('dark'),newClient:r.classList.contains('showdown-new-client'),background:s.backgroundImage,prefs:JSON.parse(localStorage.getItem('showdown_prefs'))};})()`);
        if(release && (choice!=='pro'||state.background.includes('radial-gradient')))break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.equal(loaded,false,'Theme must be available while the slow resource is still loading');
      assert.equal(state.pro,choice==='pro');
      assert.equal(state.dark,choice==='pro'||choice==='dark');
      assert.equal(state.bodyDark,client!=='oldclient' && (choice==='pro'||choice==='dark'));
      assert.equal(state.newClient,client!=='oldclient');
      assert.equal(state.background.includes('radial-gradient'),choice==='pro');
      assert.equal(state.prefs.theme,choice);
      if(choice!=='pro')assert.equal(state.prefs.avatar,'preserved');
      assert.equal(wc.isAudioMuted(),true);
      const finish=release;release=null;finish();await navigation;
      console.log((client||'newclient (redirected root)')+': '+choice+' styling applied before page load; saved preferences retained; muted');
    }
  }
  console.log('Early theme checks passed on '+process.platform+'/'+process.arch);
  clearTimeout(timeout);win.destroy();app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);release?.();win?.destroy();app.exit(1);});
