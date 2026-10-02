require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,net,protocol}=require('electron');
protocol.registerSchemesAsPrivileged([{scheme:'showdown-pro',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {isolateAuditNetwork,loadAuditClient}=require('./audit-client.cjs');
const auditFlag=process.argv.indexOf('--audit-showdex-update');
const root=path.resolve(__dirname,'..'),stage=path.resolve(process.argv[auditFlag>=0?auditFlag+1:2]),bundle=path.join(stage,'showdex');
app.setPath('userData',process.env.SHOWDOWN_PRO_UPDATE_PROFILE||path.join(stage,'test-results/showdex-profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const ses=session.fromPartition('persist:update-showdex'),missing=new Set();
 isolateAuditNetwork(ses);
 ses.protocol.handle('showdown-pro',async request=>{
  const url=new URL(request.url),base=url.hostname==='showdex'?bundle:url.hostname==='assets'?path.join(root,'app/assets'):null;
  if(!base)return new Response('',{status:404});const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(base+path.sep))return new Response('',{status:404});
  try{const response=await net.fetch(pathToFileURL(file).href);const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','https://play.pokemonshowdown.com');return new Response(response.body,{status:response.status,headers});}catch{if(!missing.has(url.href)){console.log('Missing optional resource: '+url.href);missing.add(url.href);}return new Response('',{status:404});}
 });
 const win=new BrowserWindow({show:false,width:1100,height:850,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
 const run=code=>wc.executeJavaScript('(()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<300;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw new Error('Showdex update validation timed out: '+code);};
 for(const version of ['old','new']) {
  await loadAuditClient(wc,'https://play.pokemonshowdown.com/'+version+'client');
  await wait(version==='old'?'window.app?.socket?.readyState===1&&window.OptionsPopup':'window.PS?.connection?.connected&&window.PS.prefs');
  await run(`${version==='old'?'app.socket.send':'PS.connection.send'}=()=>{};`);
  assert.equal(await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8')),true);
  await wc.insertCSS('@scope (html.showdown-pro){'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}',{cssOrigin:'user'});
  await run(version==='old'?"OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}});":"PS.prefs.set('theme','pro');");
  await wc.executeJavaScript(fs.readFileSync(path.join(bundle,'main.js'),'utf8'));
  await wait('window.__SHOWDEX_INIT&&document.querySelector("[data-showdex-module=hellodex]")');
  assert.equal(wc.isAudioMuted(),true);
  const host=version==='old'?'app':'PS';
  await run(`${host}.focusRoom('hellodex');`);
  await pause(400);
  const click=async label=>{await run(`const button=[...document.querySelectorAll('[data-showdex-module] button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)});if(!button)throw new Error('Missing Showdex control: '+${JSON.stringify(label)});button.click();`);await pause(300);};
  await click('Open Showdex Settings');
  for(const mode of ['Light','Dark','Pro']) {
   await click(mode);
   assert.equal(await run('return document.documentElement.classList.contains("showdex-pro");'),mode==='Pro');
   for(const width of [1100,680]){win.setContentSize(width,850);await pause(150);assert.equal(await run('return !!document.querySelector("[data-showdex-module=hellodex] button[aria-label=Pro]");'),true);}
  }
  await click('Close Showdex Settings');
  const {history,request}=require('../tests/fixtures.cjs');
  const id='battle-gen9randombattle-'+(version==='old'?'993381':'993382');
  await run(version==='old'?"app.user.set({name:'ProTest',named:true});":"PS.user.setName('ProTest',true,'1');");
  await run(`${host}.receive(${JSON.stringify('>'+id+'\n'+history().join('\n'))});${host}.focusRoom(${JSON.stringify(id)});`);
  await wait(`${host}.rooms[${JSON.stringify(id)}]?.battle`);
  await run(`${host}.receive(${JSON.stringify('>'+id+'\n|request|'+JSON.stringify(request()))});${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
  await pause(2000);
  fs.writeFileSync(path.join(stage,'showdex-'+version+'-state.json'),JSON.stringify(await run(`const host=${host};return {user:host.user?.name,rooms:Object.keys(host.rooms),modules:[...document.querySelectorAll('[data-showdex-module]')].map(e=>e.dataset.showdexModule),battlePlayer:host.rooms[${JSON.stringify(id)}]?.battle?.mySide?.name};`),null,2));
  await wait('document.querySelector("[data-showdex-module=calcdex]")');
  assert.equal(await run('return document.documentElement.classList.contains("showdex-pro");'),true);
  fs.mkdirSync(path.join(stage,'test-results'),{recursive:true});
  fs.writeFileSync(path.join(stage,'test-results/showdex-'+version+'.png'),(await wc.capturePage()).toPNG());
  console.log(version+': updated Showdex initialized; Pro/Light/Dark and calculator controls passed');
 }
 assert.equal(missing.size,0,'Updated Showdex must include all requested local assets');
 win.close();app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
