require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,protocol,net,ipcMain,nativeTheme}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {loadAuditClient,isolateAuditNetwork}=require('./audit-client.cjs');
const {searchReplays,loadReplay,replayAccount}=require('../app/replays.cjs');
const {history,request}=require('../tests/fixtures.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/replays');
app.setPath('userData',path.join(out,'profile'));app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'showdown-pro',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
setTimeout(()=>{console.error('Replay audit timed out');app.exit(1);},180000).unref();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const replayURL='https://replay.pokemonshowdown.com/gen9randombattle-998955';
const fixture={players:['ProTest','Opponent'],format:'[Gen 9] Random Battle',log:history(request()).filter(line=>!line.startsWith('|request|')).concat(['|move|p1a: Charizard|Air Slash|p2a: Blastoise','|-damage|p2a: Blastoise|20/100','|turn|2','|win|ProTest']).join('\n')};
let fixtureMode=false,accountSignedIn=true;const queries=[],reports=[];
const fetcher=async(url,options)=>{
 if(!fixtureMode)return net.fetch(url,options);
 if(url.endsWith('/check-login'))return new Response(accountSignedIn?']protest,':'],');
 if(url===replayURL+'.json')return new Response(JSON.stringify(fixture));
 if(url.includes('/api/replays/'))return new Response(']'+JSON.stringify(Array.from({length:51},()=>({id:'gen9randombattle-998955',players:fixture.players,format:fixture.format,uploadtime:1792000000,rating:1500}))));
 return new Response('',{status:404});
};
ipcMain.handle('client:replay-search',(_event,query)=>{queries.push(query);return searchReplays(query,fetcher);});
ipcMain.handle('client:replay-load',(_event,url)=>loadReplay(url,fetcher));
ipcMain.handle('client:replay-account',()=>replayAccount(fetcher));
ipcMain.handle('client:theme-css',()=>require('../app/client-theme-css.cjs'));
ipcMain.handle('client:zoom-state',()=>({clientZoomPercent:100,showdexZoomPercent:100,css:require('../app/client-zoom.cjs').showdexZoomCSS}));
ipcMain.handle('client:theater-layout',(_event,value)=>value||{width:420,chatShare:.56,chatCollapsed:true,calcCollapsed:true});
ipcMain.on('client:receive',(_event,data)=>reports.push(data));
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});const ses=session.fromPartition('replays-audit');isolateAuditNetwork(ses);
 ses.protocol.handle('showdown-pro',async req=>{const url=new URL(req.url),base=url.hostname==='showdex'?path.join(root,'build/showdex'):url.hostname==='assets'?path.join(root,'app/assets'):null;if(!base)return new Response('',{status:404});const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(base+path.sep))return new Response('',{status:403});const response=await net.fetch(pathToFileURL(file).href),headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','https://play.pokemonshowdown.com');return new Response(response.body,{status:response.status,headers});});
 ses.on('will-download',event=>event.preventDefault());
 const win=new BrowserWindow({show:false,width:1680,height:960,webPreferences:{session:ses,preload:path.join(root,'app/client-preload.cjs'),offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
 const run=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
 wc.on('console-message',d=>{if(d.level==='error'&&/TypeError|ReferenceError|React error/.test(d.message))console.error(d.message.slice(0,600));});
 const wait=async(code,label=code)=>{for(let i=0;i<250;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw Error('Timed out '+label);};
 try{
  for(const version of ['old','new']){
   fixtureMode=false;reports.length=0;queries.length=0;
   await loadAuditClient(wc,'https://play.pokemonshowdown.com/'+version+'client');const host=version==='old'?'app':'PS';
   await wait(version==='old'?'window.app?.socket?.readyState===1&&window.Storage':'window.PS?.connection?.connected&&window.PS.prefs');
   await run(version==='old'?"window.__sent=[];app.socket.send=value=>__sent.push(value);Storage.prefs('autotimer',false);Storage.prefs('theme','pro');":"window.__sent=[];PS.connection.send=value=>__sent.push(value);PS.prefs.set('autotimer',false);PS.prefs.set('theme','pro');");
   for(const file of ['client-bridge.js','client-theme.js','theater-mode.js','client-replays.js'])await wc.executeJavaScript(fs.readFileSync(path.join(root,'app',file),'utf8'));
   const css=require('../app/client-theme-css.cjs')+'\n'+fs.readFileSync(path.join(root,'app/theater-mode.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'app/client-replays.css'),'utf8');
   // Production installs both user- and author-origin styles.
   await wc.insertCSS(css,{cssOrigin:'user'});await wc.insertCSS(css);
   await wc.executeJavaScript(fs.readFileSync(path.join(root,'build/showdex/main.js'),'utf8'));
   await wait('window.__SHOWDEX_INIT&&window.__showdownProCalcdex');
   assert.ok(await run('return document.querySelector(".pro-replays-menu")?.checkVisibility();'),'Home replay menu is visible');
   assert.ok(await run(`const a=document.querySelector('.pro-replays-menu'),b=document.querySelector('#room- [name=finduser],#room- a[href=users]');a.blur();const x=getComputedStyle(a),y=getComputedStyle(b);return x.backgroundImage===y.backgroundImage&&x.backgroundColor===y.backgroundColor&&x.borderRadius===y.borderRadius;`),'Home Replays matches the native Home action palette');
   await run('document.querySelector(".pro-replays-menu").click();');
   await wait('document.querySelector(".pro-replays").open&&document.querySelector(".pro-replay-result")','Official recent replays appear');
   const realLink=await run('return document.querySelector(".pro-replay-result").href;');
   assert.ok(/^https:\/\/replay.pokemonshowdown.com\//.test(realLink));
   await pause(200);fs.writeFileSync(path.join(out,version+'-browser.png'),(await wc.capturePage()).toPNG());
   const realId=await run(`return __showdownProReplays.open(${JSON.stringify(realLink)});`);
   assert.ok(realId,'A real official replay loads in a native battle room');
   assert.ok(await run(`const room=${host}.rooms[${JSON.stringify(realId)}];return room.battle.stepQueue.length>5&&!room.request&&!room.connected&&room.battle.paused;`));
   fixtureMode=true;reports.length=0;
   await run(version==='old'?"app.user.set({name:'ProTest',named:true});":"PS.user.setName('ProTest',true,'1');");
   await run('__showdownProReplays.show();document.querySelector(".pro-replays input[name=username]").value="ProTest";document.querySelector(".pro-replays input[name=username]").form.requestSubmit();');
   await wait('!document.querySelector(".pro-replays input[value=private]").disabled');
   assert.ok(await run('return [...document.querySelectorAll(".pro-replays-actions button")].some(button=>button.textContent==="ProTest\u0027s replays");'),'Signed-in username has its own replay shortcut');
   await run('[...document.querySelectorAll(".pro-replays-actions button")].find(button=>button.textContent==="ProTest\u0027s replays").click();');
   await wait('document.querySelector(".pro-replays > h3").textContent==="Search results"');
   assert.equal(queries.at(-1).username,'ProTest');assert.equal(queries.at(-1).private,false);
   await wc.insertCSS('html body button {background:#777!important;border-radius:0!important;}',{cssOrigin:'user'});
   assert.ok(await run('return [...document.querySelectorAll(".pro-replays button")].every(button=>getComputedStyle(button).backgroundImage.includes("gradient")&&getComputedStyle(button).borderRadius!=="0px");'),'Replay Pro controls win over broad native dark-button styles');
   for(const zoom of [1,1.45]){
    wc.setZoomFactor(zoom);
    for(const [theme,system] of [['light','light'],['dark','dark'],['pro','dark'],['system','light'],['system','dark']]){
     nativeTheme.themeSource=system;
     await run(version==='old'?`OptionsPopup.prototype.setTheme({currentTarget:{value:'${theme}'}});`:`PS.prefs.set('theme','${theme}');`);await pause(150);
     const label=theme==='system'?'system-'+system:theme;
     const expected=theme==='pro'?{surface:'rgb(23, 47, 64)',text:'rgb(232, 241, 247)',field:'rgb(17, 38, 52)',card:'rgb(29, 58, 77)',muted:'rgb(185, 221, 236)',thumb:'rgb(78, 128, 155)',scheme:'dark'}:system==='dark'?{surface:'rgb(40, 44, 49)',text:'rgb(228, 232, 237)',field:'rgb(29, 34, 40)',card:'rgb(50, 56, 64)',muted:'rgb(174, 189, 201)',thumb:'rgb(105, 121, 137)',scheme:'dark'}:{surface:'rgb(244, 246, 248)',text:'rgb(36, 49, 62)',field:'rgb(255, 255, 255)',card:'rgb(255, 255, 255)',muted:'rgb(82, 101, 117)',thumb:'rgb(131, 149, 166)',scheme:'light'};
     const colors=await run(`const d=document.querySelector('.pro-replays'),s=getComputedStyle(d),row=d.querySelector('.pro-replay-result');return {surface:s.backgroundColor,text:s.color,scheme:s.colorScheme,scrollbar:s.scrollbarColor,fields:[...d.querySelectorAll('.textbox')].map(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,placeholder:e.tagName==='INPUT'?getComputedStyle(e,'::placeholder').color:null})),card:getComputedStyle(row).backgroundColor,cardText:getComputedStyle(row.querySelector('strong')).color,buttons:[...d.querySelectorAll('button')].map(e=>({background:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).color,radius:getComputedStyle(e).borderRadius,appearance:getComputedStyle(e).appearance})),bounds:{width:d.getBoundingClientRect().width,height:d.getBoundingClientRect().height,viewportWidth:innerWidth,viewportHeight:innerHeight}};`);
     assert.equal(colors.surface,expected.surface,version+' '+label+' replay surface');assert.equal(colors.text,expected.text);assert.equal(colors.scheme,expected.scheme);
     assert.equal(colors.card,expected.card);assert.equal(colors.cardText,expected.text);
     assert.ok(colors.scrollbar.includes(expected.thumb),version+' '+label+' themed scrollbar');
     assert.ok(colors.fields.every(field=>field.background===expected.field&&field.color===expected.text&&(!field.placeholder||field.placeholder===expected.muted)),version+' '+label+' fields/placeholder: '+JSON.stringify(colors.fields));
     assert.ok(colors.buttons.every(button=>button.background.includes('gradient')&&button.color===expected.text&&button.radius==='6px'&&button.appearance==='none'),version+' '+label+' buttons resist native paint: '+JSON.stringify(colors.buttons));
     assert.ok(colors.bounds.width<=colors.bounds.viewportWidth&&colors.bounds.height<=colors.bounds.viewportHeight,version+' '+label+' dialog fits at '+zoom+' zoom');
     fs.writeFileSync(path.join(out,version+'-browser-'+label+'-'+Math.round(zoom*100)+'.png'),(await wc.capturePage()).toPNG());
    }
   }
   nativeTheme.themeSource='system';wc.setZoomFactor(1);
   await run(version==='old'?"OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}});":"PS.prefs.set('theme','pro');");
   console.log(version+': replay Light/Dark/Pro/System palettes, native controls and 100%/145% zoom passed.');
   await run('document.querySelector(".pro-replays input[value=private]").click();');
   await wait('document.querySelector(".pro-replays > h3").textContent==="Your private replays"');
   assert.equal(queries.at(-1).private,true);assert.equal(queries.at(-1).username,'protest');
   assert.ok(await run('return document.querySelector(".pro-replays input[name=username]").readOnly;'),'Private search stays bound to the signed-in account');
   await pause(150);fs.writeFileSync(path.join(out,version+'-private.png'),(await wc.capturePage()).toPNG());
   await run('document.querySelector(".pro-replays input[value=public]").click();');
   await wait('document.querySelectorAll(".pro-replay-result").length===50');
   await run('document.querySelector(".pro-replays nav button:last-child").click();');await wait('document.querySelector(".pro-replays nav span").textContent==="Page 2"');
   assert.equal(queries.at(-1).page,2);
   const id=await run(`return __showdownProReplays.open(${JSON.stringify(replayURL)});`);assert.ok(id);await pause(500);
   const normalChatGap=await run(`const room=document.getElementById('room-${id}');return room.getBoundingClientRect().bottom-room.querySelector('.battle-log').getBoundingClientRect().bottom;`);
   assert.ok(Math.abs(normalChatGap)<2,'Replay chat fills the normal panel without reserving input space: '+normalChatGap);
   assert.ok(await run(`const r=${host}.rooms['${id}'];return r.battle.paused&&r.battle.turn===0&&!r.request&&!r.connected;`));
   assert.equal(reports.length,0,'Offline replay never enters the live match tracker');
   assert.ok(!await run('return __sent.some(line=>String(line).includes("proreplay"));'),'No replay join or game command goes to the server');
   await wait(`document.getElementById('room-${id}').querySelector('button[name=resume],button[data-cmd="/play"]')`,'Native Play button');
   await run(`document.getElementById('room-${id}').querySelector('button[name=resume],button[data-cmd="/play"]').click();`);
   assert.equal(await run(`return ${host}.rooms['${id}'].battle.paused;`),false,'Native replay play works');
   await run(`${host}.rooms['${id}'].battle.pause();${host}.rooms['${id}'].battle.seekTurn(Infinity);`);await pause(250);
   assert.ok(await run(`const node=document.getElementById('room-${id}').querySelector('.replayDownloadButton');node.click();return /^(?:data:|blob:)/.test(node.href)&&!document.querySelector('.pro-replays').open;`),'Native replay download remains available and is not intercepted as a replay link');
   await wait(`document.getElementById('room-${id}').querySelector('.pro-theater-toggle')`);
   await run(`document.getElementById('room-${id}').querySelector('.pro-theater-toggle').click();`);await wait(`__showdownProTheater.active==='${id}'`);
   await wait('document.querySelector(".pro-theater-calcdex [data-pro-calc=player]")','Native Showdex receives replay data');
   await run(`document.querySelector('#room-${id} .pro-theater-chat-header button').click();`);
   await wait(`document.getElementById('room-${id}').dataset.proTheaterCollapsed==='false'`);
   for(const [width,height] of [[1680,960],[1100,760]]){
    win.setContentSize(width,height);await pause(200);
    const layout=await run(`const room=document.getElementById('room-${id}'),log=room.querySelector('.battle-log'),calc=room.querySelector('.pro-theater-calc-header'),input=room.querySelector('[data-pro-theater-part="chat-input"]');return {gap:calc.getBoundingClientRect().top-log.getBoundingClientRect().bottom,input:input?.getBoundingClientRect().height||0,radius:getComputedStyle(log).borderBottomLeftRadius};`);
    assert.ok(Math.abs(layout.gap-8)<2,'Theater replay chat fills its panel with the normal 8px panel gap: '+JSON.stringify(layout));
    assert.equal(layout.input,0,'Replay chat does not display an empty input footer');
    assert.equal(layout.radius,'8px','Replay chat keeps rounded bottom corners');
   }
   win.setContentSize(1680,960);await pause(200);
   fs.writeFileSync(path.join(out,version+'-playback.png'),(await wc.capturePage()).toPNG());
   await run('__showdownProTheater.exit();');
   const count=await run(`return Object.keys(${host}.rooms).length;`);
   await run(`const a=document.createElement('a');a.href=${JSON.stringify(replayURL)};a.textContent='Replay';document.body.append(a);a.click();a.remove();`);await pause(250);
   assert.equal(await run(`return Object.keys(${host}.rooms).length;`),count,'Replay links focus an existing native tab');
   await run(`await __showdownProReplays.open('https://replay.pokemonshowdown.com/gen9ou-404');`);
   assert.ok(await run('const text=document.querySelector(".pro-replays-status").textContent;return document.querySelector(".pro-replays").open&&text.includes("not found")&&!text.includes("remote method");'),'Missing replay shows a readable recoverable error');
   await run('document.querySelector(".pro-replays header button").click();');
   accountSignedIn=false;await run('__showdownProReplays.show();');
   await wait('document.querySelector(".pro-replays input[value=private]").disabled&&document.querySelector(".pro-replays-account").textContent.includes("Log in")');
   await run('document.querySelector(".pro-replays header button").click();');accountSignedIn=true;
   assert.equal(reports.length,0);console.log(version+' replay browser, official playback, native controls, Showdex, Theater and errors passed');
  }
  win.destroy();app.exit(0);
 }catch(error){console.error(error);fs.writeFileSync(path.join(out,'failure.png'),(await wc.capturePage()).toPNG());fs.writeFileSync(path.join(out,'failure.html'),await run('return document.documentElement.outerHTML;'));app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
