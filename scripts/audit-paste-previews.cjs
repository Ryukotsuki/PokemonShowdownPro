const {app,session,BrowserWindow}=require('electron');
require('./mute-test-audio.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {BrowserAddons}=require('../app/browser-addons.cjs');
const {addonDefaults}=require('../app/addon-catalog.cjs');
const {history}=require('../tests/fixtures.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/paste-previews');
app.setPath('userData',path.join(out,'profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const ses=session.fromPartition('persist:paste-previews'),manager=new BrowserAddons(root,ses);
 await manager.apply(Object.fromEntries(Object.keys(addonDefaults).map(key=>[key,key==='threeIsland'])));
 assert.equal(manager.errors.size,0);
 const win=new BrowserWindow({show:false,width:1000,height:720,webPreferences:{session:ses,backgroundThrottling:false}}),wc=win.webContents;
 wc.on('console-message',details=>{if(details.level==='error')console.error(details.message);});
 const run=code=>wc.executeJavaScript('(()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<160;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw new Error('Timed out: '+code);};
 let opened=0;wc.setWindowOpenHandler(()=>{opened++;return {action:'deny'};});
 const paste=['Pikachu @ Light Ball','Ability: Static','Tera Type: Electric','EVs: 252 Atk / 4 SpD / 252 Spe','Jolly Nature','IVs: 0 SpA','- Thunderbolt','- Quick Attack','- Volt Switch','- Iron Tail'].join('\n');
 const report=[];
 for(const client of ['old','new']) {
  await wc.loadURL('https://play.pokemonshowdown.com/'+client+'client');
  const host=client==='old'?'app':'PS',id='battle-gen9randombattle-998';
  await wait(client==='old'?'window.app?.socket?.readyState===1 && window.Dex?.getPokemonIcon':'window.PS?.connection?.connected && window.PS?.roomTypes?.battle && window.Dex?.getPokemonIcon');
  await wait('document.getElementById("3I-STATE") && window.__showdownProPastePreview');
  await wc.insertCSS('@scope (html.showdown-pro){'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}',{cssOrigin:'user'});
  await run(`${client==='old'?'app.socket.send':'PS.connection.send'}=()=>{};
    ${client==='old'?"app.user.set({name:'ProTest',named:true});":"PS.user.name='ProTest';PS.user.named=true;"}
    const original=window.fetch;window.fetch=(url,...args)=>String(url).includes('pokepast.es/previewaudit')?Promise.resolve(new Response(JSON.stringify({title:'Preview audit',notes:'Format: gen9ou',paste:${JSON.stringify(Array(6).fill(paste).join('\n\n'))}}),{headers:{'Content-Type':'application/json'}})):original(url,...args);
    ${host}.receive(${JSON.stringify('>'+id+'\n'+history().filter(line=>!line.startsWith('|request|')).join('\n'))});${host}.focusRoom(${JSON.stringify(id)});
    ${host}.receive(${JSON.stringify('>'+id+'\n|c| Other|https://pokepast.es/previewaudit0001')});
    ${host}.receive(${JSON.stringify('|pm| Other| ProTest|https://pokepast.es/previewaudit0002')});`);
  await wait('document.querySelectorAll(".threeisland-link").length>=2 && document.querySelectorAll(".threeisland-set[tabindex]").length>=12');
  for(const theme of ['light','dark','pro'])for(const kind of ['battle','pm'])for(const width of [320,220]) {
   const select=kind==='battle'?`document.getElementById('room-${id}').querySelector('.threeisland-link')`:`[...document.querySelectorAll('.threeisland-link')].find(link=>!link.closest('[id^="room-battle-"]'))`;
   await run(`${host}.focusRoom(${JSON.stringify(kind==='battle'?id:'')});`);await pause(100);
   await run(`document.querySelectorAll('.threeisland-tooltip:popover-open').forEach(p=>p.hidePopover());document.activeElement?.blur();document.documentElement.classList.toggle('showdown-pro',${theme==='pro'});document.documentElement.classList.toggle('dark',${theme!=='light'});document.body.classList.toggle('dark',${theme!=='light'});
     window.auditAnchor=${select};window.auditPane=auditAnchor.closest('.battle-log,.chat-log,.pm-log')||auditAnchor.closest('.message-log');
     auditPane.style.cssText='position:fixed!important;left:auto!important;right:8px!important;top:auto!important;bottom:16px!important;width:${width}px!important;height:250px!important;overflow:auto!important;z-index:10000!important;';
     auditAnchor.scrollIntoView({block:'end'});auditAnchor.focus();
     // Hidden Electron windows do not dispatch focusin when the document is inactive.
     auditAnchor.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));`);
   await wait('auditAnchor.querySelector(":scope > .threeisland-tooltip").matches(":popover-open")');
   await pause(100);
   const check=await run(`const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};const preview=auditAnchor.querySelector(':scope > .threeisland-tooltip'),button=preview.querySelector('button'),style=getComputedStyle(button);return {pane:rect(auditPane),anchor:rect(auditAnchor),preview:rect(preview),button:rect(button),scroll:preview.scrollWidth,client:preview.clientWidth,buttonColor:style.color,buttonBackground:style.backgroundImage,viewport:innerHeight};`);
   assert.ok(check.preview.left>=check.pane.left && check.preview.right<=check.pane.right,client+' '+kind+' preview fits pane');
   assert.ok(check.button.left>=check.preview.left && check.button.right<=check.preview.right,client+' '+kind+' Import fits preview');
   assert.ok(check.preview.bottom<=check.viewport && check.preview.top>=0);assert.ok(check.scroll<=check.client+1,'no horizontal preview overflow');
   if(theme==='pro')assert.match(check.buttonBackground,/gradient/,'Import uses Pro styling');
   await run('const icon=auditAnchor.querySelector(".threeisland-set");icon.focus();icon.dispatchEvent(new FocusEvent("focusin",{bubbles:true}));');
   await wait('auditAnchor.querySelector(".threeisland-set > .threeisland-tooltip").matches(":popover-open")');
   const detail=await run(`const popup=auditAnchor.querySelector('.threeisland-set > .threeisland-tooltip'),r=popup.getBoundingClientRect(),pre=popup.querySelector('pre');return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:popup.scrollWidth,client:popup.clientWidth,text:pre.textContent};`);
   assert.ok(detail.left>=check.pane.left && detail.right<=check.pane.right,'set fits pane');assert.ok(detail.top>=0 && detail.bottom<=check.viewport,'set fits window');assert.ok(detail.width<=detail.client+1);assert.match(detail.text,/Thunderbolt/);
   if(theme==='pro' && width===320) {
    await wc.capturePage();await pause(150);fs.writeFileSync(path.join(out,client+'-'+kind+'.png'),(await wc.capturePage()).toPNG());
   }
   await wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});await pause(50);
   assert.equal(await run('return document.querySelectorAll(".threeisland-tooltip:popover-open").length;'),0);
   report.push({client,theme,kind,width,check,detail});
  }
  // Import stays attached to its own link and creates a local team, not a navigation.
  const before=await run(`return ${client==='old'?'Storage.teams.length':'PS.teams.list.length'};`);
  const point=await run('document.activeElement?.blur();const r=auditAnchor.getBoundingClientRect();return {x:Math.round(r.left+5),y:Math.round(r.top+5)};');
  wc.sendInputEvent({type:'mouseMove',...point});
  await wait('auditAnchor.querySelector(":scope > .threeisland-tooltip").matches(":popover-open")');
  await run('auditAnchor.querySelector(":scope > .threeisland-tooltip button").click();');
  await wait(`${client==='old'?'Storage.teams.length':'PS.teams.list.length'}===${before+1}`);assert.equal(opened,0);
  console.log(client+': battle and PM previews, nested set details, all themes, narrow panes, Escape and import passed');
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
