// The real client and shipped Showdex must initialize before a deliberately
// stalled image finishes loading. No account or battle actions are performed.
require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,ipcMain,protocol}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {installClientScripts}=require('../app/client-startup.cjs');
const {isolateAuditNetwork}=require('./audit-client.cjs');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),origin='https://play.pokemonshowdown.com/';
protocol.registerSchemesAsPrivileged([{scheme:'showdown-pro',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let win,release;
const timeout=setTimeout(()=>{console.error('Showdex startup audit timed out');release?.();app.exit(1);},60000);
app.whenReady().then(async()=>{
  const ses=session.fromPartition('showdex-startup-'+Date.now());
  isolateAuditNetwork(ses);
  ses.protocol.handle('showdown-pro',async request=>{
    const url=new URL(request.url),base=url.hostname==='showdex'?path.join(root,'build/showdex'):url.hostname==='assets'?path.join(root,'app/assets'):null;
    if(!base)return new Response('',{status:404});
    const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(base+path.sep))return new Response('',{status:403});
    try {const response=await ses.fetch(pathToFileURL(file).href);const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',origin.slice(0,-1));return new Response(response.body,{status:response.status,headers});}
    catch{return new Response('',{status:404});}
  });
  ses.protocol.handle('https',async request=>{
    const url=new URL(request.url);
    if(url.origin===origin.slice(0,-1)&&url.pathname==='/__pro-slow-startup') {
      await new Promise(resolve=>{release=resolve;});return new Response('',{status:404});
    }
    const response=await ses.fetch(request.url,{bypassCustomProtocolHandlers:true});
    if(url.origin===origin.slice(0,-1)&&['/oldclient','/newclient'].includes(url.pathname)) {
      const document=await response.text();
      const image='<img src="/__pro-slow-startup" style="display:none">';
      const html=/<\/body\s*>/i.test(document)?document.replace(/<\/body\s*>/i,image+'</body>'):document+image;
      const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
      return new Response(html,{status:response.status,headers});
    }
    return response;
  });
  win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{session:ses,preload:path.join(root,'app/client-preload.cjs'),
    sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
  const wc=win.webContents;
  ipcMain.handle('client:theme-css',event=>event.sender===wc&&event.senderFrame===wc.mainFrame?require('../app/client-theme-css.cjs'):null);
  for(const version of ['old','new']) {
    let loaded=false;
    const dom=new Promise(resolve=>wc.once('dom-ready',resolve));
    const navigation=wc.loadURL(origin+version+'client').then(()=>{loaded=true;});navigation.catch(()=>{});
    await dom;
    const began=Date.now();
    const result=await installClientScripts({contents:wc,clientURL:origin,
      bridge:fs.readFileSync(path.join(root,'app/client-bridge.js'),'utf8'),
      themeScript:fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8'),
      themeCSS:require('../app/client-theme-css.cjs'),autoTimer:false,
      getBundle:()=>path.join(root,'build/showdex/main.js')});
    assert.deepEqual(result,{showdex:true});
    for(let i=0;i<100;i++) {
      if(await wc.mainFrame.executeJavaScript("!!document.querySelector('[data-showdex-module=hellodex]') && document.documentElement.classList.contains('showdex-pro')"))break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(await wc.mainFrame.executeJavaScript("!!document.querySelector('[data-showdex-module=hellodex]') && document.documentElement.classList.contains('showdex-pro')"),true);
    assert.equal(loaded,false,'Showdex must render while the image is still loading');
    assert.equal(typeof release,'function','The stalled resource must have been requested');
    assert.equal(wc.isAudioMuted(),true);
    console.log(version+' client: Showdex Pro rendered in '+(Date.now()-began)+'ms after DOM ready, before page load; muted');
    const finish=release;release=null;finish();await navigation;
  }
  clearTimeout(timeout);win.destroy();app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);release?.();win?.destroy();app.exit(1);});
