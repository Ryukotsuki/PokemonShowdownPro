require('./mute-test-audio.cjs');
const {app,BrowserWindow,session,protocol,net,nativeTheme}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {loadAuditClient,isolateAuditNetwork}=require('./audit-client.cjs');
const {history:fixtureHistory,request:fixtureRequest}=require('../tests/fixtures.cjs');
// Six native switch buttons catch wrapping/clipping that a two-member team misses.
const request=(rqid=1)=>{const req=fixtureRequest(rqid);for(const species of ['Pikachu','Dragonite','Gengar','Slowbro'])req.side.pokemon.push({...req.side.pokemon[1],ident:'p1: '+species,details:species+', L80, M'});return req;};
const history=()=>fixtureHistory(request()).map(line=>line==='|teamsize|p1|2'?'|teamsize|p1|6':line);
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/theater');
app.setPath('userData',path.join(out,'profile'));app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'showdown-pro',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
setTimeout(()=>{console.error('Theater audit timed out');app.exit(1);},180000).unref();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});const ses=session.fromPartition('theater-audit');isolateAuditNetwork(ses);
 ses.protocol.handle('showdown-pro',async req=>{const url=new URL(req.url),base=url.hostname==='showdex'?path.join(root,'build/showdex'):url.hostname==='assets'?path.join(root,'app/assets'):null;if(!base)return new Response('',{status:404});const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(base+path.sep))return new Response('',{status:403});const response=await net.fetch(pathToFileURL(file).href),headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','https://play.pokemonshowdown.com');return new Response(response.body,{status:response.status,headers});});
 const win=new BrowserWindow({show:false,width:1680,height:960,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
 const run=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
 wc.on('console-message',d=>{if(d.level==='error'&&/TypeError|ReferenceError|React error/.test(d.message))console.error(d.message.slice(0,600));});
 const wait=async(code,label=code)=>{for(let i=0;i<300;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw Error('Timed out '+label);};
 try{
  for(const version of (process.env.SHOWDOWN_PRO_AUDIT_CLIENT?[process.env.SHOWDOWN_PRO_AUDIT_CLIENT]:['old','new'])){
   await loadAuditClient(wc,'https://play.pokemonshowdown.com/'+version+'client');const host=version==='old'?'app':'PS',id='battle-gen9randombattle-998951';
   await wait(version==='old'?'window.app?.socket?.readyState===1&&window.Storage':'window.PS?.connection?.connected&&window.PS.prefs');
   await run("window.__nativeSent=[];");
   await run(version==='old'?"app.socket.send=value=>__nativeSent.push(value);app.user.set({name:'ProTest',named:true});Storage.prefs('autotimer',false);Storage.prefs('theme','pro');":"PS.connection.send=value=>__nativeSent.push(value);PS.user.setName('ProTest',true,'1');PS.prefs.set('autotimer',false);PS.prefs.set('theme','pro');");
   await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-bridge.js'),'utf8'));await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8'));
   await wc.insertCSS(require('../app/client-theme-css.cjs')+'\n'+fs.readFileSync(path.join(root,'app/theater-mode.css'),'utf8'),{cssOrigin:'user'});await wc.insertCSS(require('../app/client-theme-css.cjs')+'\n'+fs.readFileSync(path.join(root,'app/theater-mode.css'),'utf8'));
   await run("window.__savedTheater=[];window.__theaterActive=[];window.showdownProEvents={receive:()=>{},sent:()=>{},getTheaterLayout:async()=>({width:260,chatShare:0.56,chatCollapsed:false,calcCollapsed:false}),setTheaterLayout:async value=>{__savedTheater.push(value);return value;},setTheaterActive:value=>__theaterActive.push(value)};");
   await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/theater-mode.js'),'utf8'));
   await wc.executeJavaScript(fs.readFileSync(path.join(root,'build/showdex/main.js'),'utf8'));
   await wait('window.__SHOWDEX_INIT&&window.__showdownProCalcdex&&document.querySelector("[data-showdex-module=hellodex]")');
   if(process.argv.includes('--follow-showdown')){
    const nativeTheme=async value=>{await run(version==='old'?`OptionsPopup.prototype.setTheme({currentTarget:{value:'${value}'}});`:`PS.prefs.set('theme','${value}');`);await pause(200);};
    const choose=async value=>{await run(`const b=[...document.querySelectorAll('[data-showdex-module=hellodex] button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(value)});if(!b)throw Error('Missing Showdex option');b.click();`);await pause(200);};
    const check=async(pro,scheme,label)=>{
     await pause(100);
     const actual=await run(`const root=document.querySelector('[data-showdex-module=hellodex]');return {pro:document.documentElement.classList.contains('showdex-pro'),modulePro:root.hasAttribute('data-showdex-pro'),scheme:root.dataset.showdexScheme};`);
     assert.deepEqual(actual,{pro,modulePro:pro,scheme},version+' '+label);
    };
    await run(`${host}.focusRoom('hellodex');document.querySelector('[data-showdex-module=hellodex] button[aria-label="Open Showdex Settings"]').click();`);
    await wait('document.querySelector("[data-showdex-module=hellodex] button[aria-label=Showdown]")');
    await choose('Showdown');await check(true,'dark','Showdown follows native Pro');
    await nativeTheme('dark');await check(false,'dark','Follow Pro to Dark without changing native dark base');
    await nativeTheme('pro');await check(true,'dark','Follow Dark to Pro without changing native dark base');
    await choose('Light');await check(false,'light','Explicit Light overrides native Pro');
    await choose('Dark');await check(false,'dark','Explicit Dark overrides native Pro');
    await choose('Pro');await nativeTheme('light');await check(true,'dark','Explicit Pro stays Pro on native Light');
    await choose('Showdown');await check(false,'light','Showdown follows native Light');
    await nativeTheme('pro');await check(true,'dark','Showdown returns to native Pro');
    assert.ok(await run(`return new Promise(resolve=>{const req=indexedDB.open('showdex');req.onsuccess=()=>{const db=req.result,get=db.transaction('settings').objectStore('settings').get('showdex');get.onsuccess=()=>{db.close();resolve(get.result?.forcedColorScheme==='showdown');};};});`),'Following Pro preserves the saved Showdown choice');
    fs.writeFileSync(path.join(out,version+'-showdown-follows-pro.png'),(await wc.capturePage()).toPNG());
   }
   if(process.argv.includes('--overlay')&&!await run('return !!window.__theaterOverlayConfigured;')){
    await run(`await new Promise((resolve,reject)=>{const req=indexedDB.open('showdex');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),get=store.get('calcdex');get.onsuccess=()=>store.put({...get.result,openAs:'overlay',openOnStart:'always'},'calcdex');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});`);
    // Reload the same native client so Showdex hydrates the changed settings.
    await loadAuditClient(wc,'https://play.pokemonshowdown.com/'+version+'client');
    await wait(version==='old'?'window.app?.socket?.readyState===1':'window.PS?.connection?.connected');
    await run(version==='old'?"window.__nativeSent=[];app.socket.send=value=>__nativeSent.push(value);app.user.set({name:'ProTest',named:true});Storage.prefs('theme','pro');":"window.__nativeSent=[];PS.connection.send=value=>__nativeSent.push(value);PS.user.setName('ProTest',true,'1');PS.prefs.set('theme','pro');");
    await run("window.__nativeSent=[];window.__savedTheater=[];window.showdownProEvents={receive:()=>{},sent:()=>{},getTheaterLayout:async()=>({width:260,chatShare:0.56,chatCollapsed:false,calcCollapsed:false}),setTheaterLayout:async value=>{__savedTheater.push(value);return value;},setTheaterActive:()=>{}};");
    await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8'));await wc.insertCSS(require('../app/client-theme-css.cjs')+'\n'+fs.readFileSync(path.join(root,'app/theater-mode.css'),'utf8'),{cssOrigin:'user'});await wc.insertCSS(require('../app/client-theme-css.cjs')+'\n'+fs.readFileSync(path.join(root,'app/theater-mode.css'),'utf8'));
    await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/theater-mode.js'),'utf8'));await wc.executeJavaScript(fs.readFileSync(path.join(root,'build/showdex/main.js'),'utf8'));
    await wait('document.querySelector("[data-showdex-module=hellodex]")');await run('window.__theaterOverlayConfigured=true;');
   }
   await run(version==='old'?"app.user.set({name:'ProTest',named:true});":"PS.user.setName('ProTest',true,'1');");
   await run(`${host}.receive(${JSON.stringify('>'+id+'\n'+history().filter(line=>!line.startsWith('|request|')).join('\n'))});${host}.receive(${JSON.stringify('>'+id+'\n|request|'+JSON.stringify(request()))});${host}.focusRoom('${id}');`);
   await wait(`${host}.rooms['${id}']?.battle`);await run(`${host}.rooms['${id}'].battle.seekTurn(Infinity);`);
   await wait(`document.getElementById('room-${id}').textContent.includes('Dragon Pulse')`);await wait(`document.getElementById('room-${id}').querySelector('.pro-theater-toggle')`);
   await run(`window.__theaterBattleInstance=${host}.rooms['${id}'].battle;`);
   const normal=await run(`const e=document.getElementById('room-${id}');return {buttons:e.querySelectorAll('.movemenu button').length,scale:e.querySelector('.battle').getBoundingClientRect().width,moveHeight:e.querySelector('.movemenu button').getBoundingClientRect().height,moveFont:getComputedStyle(e.querySelector('.movemenu button')).fontSize,battle:${host}.rooms['${id}'].battle.stepQueue.length,right:(${host}.rightPanel||${host}.curSideRoom)?.id||null};`);
   await run(`document.getElementById('room-${id}').querySelector('.pro-theater-toggle').click();`);
   await wait(`__showdownProTheater.active==='${id}'`);await wait(`document.querySelector('.pro-theater-calcdex [data-pro-calc="player"]')`);await pause(700);
   const setTheme=async value=>{
    await run(version==='old'?`OptionsPopup.prototype.setTheme({currentTarget:{value:'${value}'}});`:`PS.prefs.set('theme','${value}');`);await pause(200);
   };
   if(version==='old'){
    const users=[' ProTest',' Opponent',...Array.from({length:20},(_,i)=>' Viewer'+String(i+1).padStart(2,'0'))];
    await run(`app.receive(${JSON.stringify('>'+id+'\n'+users.map(name=>'|j|'+name).join('\n'))});app.rooms['${id}'].battle.seekTurn(Infinity);`);
    await wait(`document.querySelectorAll('#room-${id} .battle-userlist button').length===${users.length}`);
    for(const [width,height,zoom] of [[1680,960,1],[1920,1080,1.45],[1100,760,1.45]]){
     win.setContentSize(width,height);wc.setZoomFactor(zoom);await pause(150);await run('__showdownProTheater.refresh();');await pause(150);
     for(const theme of ['light','dark','pro']){
      await setTheme(theme);
      await run(`const list=document.querySelector('#room-${id} .battle-userlist');if(list.classList.contains('userlist-minimized'))list.querySelector('.userlist-count').click();list.scrollTop=0;`);await pause(150);
      fs.writeFileSync(path.join(out,'old-users-'+theme+'-'+width+'-'+Math.round(zoom*100)+'.png'),(await wc.capturePage()).toPNG());
      const metrics=await run(`const list=document.querySelector('#room-${id} .battle-userlist'),log=document.querySelector('#room-${id} .battle-log'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,width:r.width};},r=rect(list);return {list:r,log:rect(log),rows:[...list.querySelectorAll('button')].slice(0,5).map(rect),scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,scrollTop:list.scrollTop,color:getComputedStyle(list).color,background:getComputedStyle(list).backgroundColor};`);
      assert.ok(metrics.list.height>=140,'Expanded old-client user list is a readable dropdown: '+JSON.stringify(metrics));
      assert.ok(metrics.rows.every(row=>row.y>=metrics.list.y&&row.bottom<=metrics.list.bottom&&row.height>=24),'First five users are visible immediately without scrolling: '+JSON.stringify(metrics));
      assert.ok(metrics.list.x>=metrics.log.x&&metrics.list.right<=metrics.log.right&&metrics.list.bottom<=metrics.log.bottom,'User dropdown stays inside chat at '+width+' '+zoom);
      assert.ok(metrics.scrollHeight>metrics.clientHeight,'A long user list scrolls within its dropdown');
      assert.ok(await run(`return [...document.querySelectorAll('#room-${id} .battle-userlist button')].every(e=>getComputedStyle(e).appearance==='none'&&getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)');`),'Native button faces cannot cover the themed user rows');
      await run(`document.querySelector('#room-${id} .battle-userlist').scrollTop=10000;`);await pause(80);
      assert.ok(await run(`const list=document.querySelector('#room-${id} .battle-userlist'),r=list.getBoundingClientRect(),count=list.querySelector('.userlist-count').getBoundingClientRect();return count.top>=r.top&&count.bottom<r.bottom&&document.elementFromPoint(count.x+count.width/2,count.y+count.height/2)?.closest('.userlist-count');`),'User count stays accessible to close a scrolled list');
      await run(`document.querySelector('#room-${id} .battle-userlist .userlist-count').click();`);await pause(80);
      assert.ok(await run(`const list=document.querySelector('#room-${id} .battle-userlist');return list.classList.contains('userlist-minimized')&&list.getBoundingClientRect().height<=28;`),'Dropdown returns to a compact native count');
      assert.ok(await run(`const list=document.querySelector('#room-${id} .battle-userlist'),count=list.querySelector('.userlist-count').getBoundingClientRect();return list.scrollTop===0&&document.elementFromPoint(count.x+count.width/2,count.y+count.height/2)?.closest('.userlist-count');`),'Closed count remains visible after scrolling a long list');
     }
    }
    wc.setZoomFactor(1);win.setContentSize(1680,960);await pause(150);await run('__showdownProTheater.refresh();');
    console.log('old: user dropdown opens with five visible names, scrolls long lists, keeps its close control visible, and fits Light/Dark/Pro at normal and narrow zoomed viewports.');
   }
   if(process.argv.includes('--users-only')){await run('__showdownProTheater.exit();');continue;}
   for(const [theme,system] of [['light','light'],['dark','dark'],['pro','dark'],['system','light'],['system','dark']]){
    nativeTheme.themeSource=system;await setTheme(theme);
    const label=theme==='system'?'system-'+system:theme;
    const expected=theme==='pro'?'rgb(20, 43, 59)':system==='dark'?'rgb(40, 44, 49)':'rgb(244, 246, 248)';
    const expectedCanvas=theme==='pro'?'rgb(12, 31, 44)':system==='dark'?'rgb(25, 28, 32)':'rgb(229, 233, 238)';
    const colors=await run(`const root=document.getElementById('room-${id}');return {canvas:getComputedStyle(root).backgroundColor,panels:[root.querySelector('.battle-controls'),root.querySelector('.battle-log'),root.querySelector('[data-pro-theater-part="chat-input"]'),root.querySelector('.pro-theater-calc-header'),document.querySelector('.pro-theater-calcdex')].map(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})),sidebar:getComputedStyle(root.querySelector('.leftbar')).backgroundColor};`);
    assert.equal(colors.canvas,expectedCanvas,version+' '+label+' canvas');
    for(const panel of colors.panels)assert.equal(panel.background,expected,version+' '+label+' chrome palette: '+JSON.stringify(colors));
    if(process.argv.includes('--follow-showdown'))assert.equal(await run('return document.documentElement.classList.contains("showdex-pro");'),theme==='pro',version+' Showdex follows '+label+' inside Theater');
    assert.ok(colors.panels.every(panel=>panel.color===(theme==='pro'?'rgb(231, 244, 252)':system==='dark'?'rgb(228, 232, 237)':'rgb(36, 49, 62)')),version+' '+label+' readable foregrounds: '+JSON.stringify(colors));
    fs.writeFileSync(path.join(out,version+'-theme-'+label+'.png'),(await wc.capturePage()).toPNG());
    await run("document.querySelector('.pro-theater-chat-header button').click();document.querySelector('.pro-theater-calc-header button[aria-label=\"Collapse Calcdex\"]').click();");await pause(150);
    const tabs=await run(`return [...document.querySelectorAll('.pro-theater-chat-header,.pro-theater-calc-header')].map(e=>({background:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).color,buttonBackground:getComputedStyle(e.querySelector('button')).backgroundColor,appearance:getComputedStyle(e.querySelector('button')).appearance}));`);
    assert.ok(tabs.every(tab=>tab.background.includes('gradient')&&tab.color===colors.panels[0].color&&tab.buttonBackground==='rgba(0, 0, 0, 0)'&&tab.appearance==='none'),version+' '+label+' collapsed tabs');
    fs.writeFileSync(path.join(out,version+'-theme-'+label+'-tabs.png'),(await wc.capturePage()).toPNG());
    await run("document.querySelector('.pro-theater-chat-header button').click();document.querySelector('.pro-theater-calc-header button[aria-label=\"Restore Calcdex\"]').click();");await pause(150);
   }
   nativeTheme.themeSource='system';await setTheme('pro');
   console.log(version+': Light, Dark, Pro and System Theater palettes and collapsed tabs passed.');
   if(process.argv.includes('--themes-only')){await run('__showdownProTheater.exit();');continue;}
   for(const [width,height] of [[1680,960],[1920,1080],[2560,1440],[3840,2160],[1080,700]]){
    win.setContentSize(width,height);await pause(350);
    await wait(`innerWidth===${width}&&innerHeight===${height}`,'Native viewport resized');
    await run('__showdownProTheater.refresh();');
    await wait(`(()=>{const log=document.querySelector('[data-pro-theater-part=log]').getBoundingClientRect(),controls=document.querySelector('[data-pro-theater-part=controls]').getBoundingClientRect();return Math.abs(log.right-${width})<10&&Math.abs(controls.bottom-${height})<10;})()`,'Theater follows native resize');
    const metrics=await run(`const root=document.getElementById('room-${id}'),r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};return {battle:r(root.querySelector('.battle')),controls:r(root.querySelector('.battle-controls')),log:r(root.querySelector('.battle-log')),toggle:r(root.querySelector('.pro-theater-toggle')),timer:root.querySelector('.timerbutton,[data-href="battletimer"]')&&r(root.querySelector('.timerbutton,[data-href="battletimer"]')),moves:[...root.querySelectorAll('.movemenu button')].map(r),calc:!!document.querySelector('.pro-theater-calcdex [data-pro-calc="moves"]'),stats:getComputedStyle(document.querySelector('.pro-theater-calcdex [data-pro-calc="stats"]')).display};`);
    console.log(version+' '+width+'x'+height+' '+JSON.stringify(metrics));
    assert.ok(Math.abs(metrics.battle.x-8)<2&&Math.abs(metrics.battle.width-metrics.controls.width)<2&&Math.abs(metrics.battle.bottom+8-metrics.controls.y)<2,'Battle fills the entire available stage without gutters');assert.ok(await run('const e=document.querySelector("[data-pro-theater-part=foreground]");return e.offsetWidth===640&&e.offsetHeight===360;'),'Foreground retains native geometry');
    assert.ok(metrics.controls.bottom<=height+2&&metrics.log.right<=width+2,'Controls and chat stay in bounds');assert.ok(metrics.controls.right<=metrics.log.x+1,'Chat and moves do not overlap');
    assert.ok(metrics.toggle.width>0&&metrics.toggle.height>0,'Toggle stays accessible');if(metrics.timer)assert.ok(metrics.toggle.right<=metrics.timer.x+2&&Math.abs(metrics.toggle.y-metrics.timer.y)<5,'Toggle sits immediately left of native timer');
    assert.ok(await run('const e=document.querySelector(".pro-theater-calcdex [data-pro-calc=player]");const r=e.getBoundingClientRect();return e.checkVisibility()&&!!document.elementFromPoint(r.x+20,r.y+20)?.closest(".pro-theater-calcdex");'),'Docked Calcdex is visibly painted and reachable');assert.ok(await run(`return !!document.getElementById('room-${id}').querySelector('.battle-log-add,.chat-log-add');`),'Chat entry remains mounted with either calculator display setting');assert.notEqual(metrics.stats,'none');assert.ok(metrics.calc);assert.equal(metrics.moves.length,normal.buttons);assert.ok(metrics.moves.every(move=>move.height<=normal.moveHeight+2),'Move buttons retain normal height');assert.equal(await run(`return getComputedStyle(document.getElementById('room-${id}').querySelector('.movemenu button')).fontSize;`),normal.moveFont,'Move typography stays native');
    if(width===1680){const details=await run('const node=document.querySelector(".pro-theater-calcdex [data-pro-calc=player]");const result=[];for(let e=node;e;e=e.parentElement){const r=e.getBoundingClientRect(),s=getComputedStyle(e);result.push({tag:e.tagName,class:e.className,width:r.width,height:r.height,x:r.x,y:r.y,display:s.display,visibility:s.visibility,opacity:s.opacity,zoom:s.zoom,hidden:e.dataset.proTheaterHidden});}return result;');fs.writeFileSync(path.join(out,version+'-calc-geometry.json'),JSON.stringify(details,null,2));}
    if(width===1680)fs.writeFileSync(path.join(out,version+'-theater.png'),(await wc.capturePage()).toPNG());
   }
   assert.ok(await run('return ["stats","field","presets"].every(role=>{const nodes=[...document.querySelectorAll(".pro-theater-calcdex [data-pro-calc="+role+"]")];return nodes.length>0&&nodes.every(node=>getComputedStyle(node).display!=="none");})&&[...document.querySelectorAll(".pro-theater-calcdex [data-pro-calc-section=info-row]")].every(node=>getComputedStyle(node).display!=="none");'),'Docked calculator exposes native set, ability/nature/item, stats and field editing');
   assert.ok(await run('const toggles=[...document.querySelectorAll(".pro-theater-calcdex [data-pro-calc-genetics]")];return toggles.length===2&&toggles.every(toggle=>toggle.dataset.proCalcGenetics==="shown");'),'Native IV/EV rows open automatically for both selected Pokemon');
   await run('document.querySelector(".pro-theater-calcdex [data-pro-calc-genetics]").click();');await pause(100);
   assert.equal(await run('return document.querySelector(".pro-theater-calcdex [data-pro-calc-genetics]").dataset.proCalcGenetics;'),'hidden','A manual native HIDE choice remains respected');
   await run('document.querySelector(".pro-theater-calcdex [data-pro-calc-genetics]").click();');await pause(100);
   win.setContentSize(1680,960);await pause(150);
   await run("document.querySelector('.pro-theater-calc-header button[aria-label=\"Enlarge Calcdex\"]').click();");await pause(200);
   assert.notEqual(await run('return getComputedStyle(document.querySelector(".pro-theater-calcdex [data-pro-calc=stats]")).display;'),'none');
   await run("document.querySelector('.pro-theater-calc-header button[aria-label=\"Return to docked Calcdex\"]').click();document.querySelector('.pro-theater-chat-header button').click();");await pause(250);
   assert.equal(await run('return __showdownProTheater.preferences.chatCollapsed;'),true);
   await run("document.querySelector('.pro-theater-chat-header button').click();document.querySelector('.pro-theater-calc-header button[aria-label=\"Collapse Calcdex\"]').click();");await pause(250);
   assert.equal(await run('return getComputedStyle(document.querySelector(".pro-theater-calcdex")).visibility;'),'hidden');
   await run("document.querySelector('.pro-theater-calc-header button[aria-label=\"Restore Calcdex\"]').click();");await pause(200);
   // Real hit testing and native hover dispatch: empty scene layers must
   // not intercept sidebar icons or the active Pokemon's tooltip targets.
   for(const selector of ['.leftbar .has-tooltip[data-tooltip="pokemon|0|0"]','.rightbar .has-tooltip[data-tooltip="pokemon|1|0"]','.tooltips [data-id="p1a"]','.tooltips [data-id="p2a"]']){
    const target=await run(`const root=document.getElementById('room-${id}'),node=root.querySelector('${selector}'),r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('.has-tooltip')===node,name:node.dataset.tooltip.includes('1|0')||node.dataset.id==='p2a'?'Blastoise':'Charizard'};`);
    assert.ok(target.hit,'Native hover target is reachable: '+selector);
    assert.ok(await run(`const node=document.getElementById('room-${id}').querySelector('${selector}'),r=node.getBoundingClientRect();return [0.25,0.5,0.75].every(fraction=>document.elementFromPoint(r.x+r.width/2,r.y+r.height*fraction)?.closest('.has-tooltip')===node);`),'Hover targets stay reachable across their full height');
    wc.sendInputEvent({type:'mouseMove',x:1,y:1});await pause(30);
    const zoom=wc.getZoomFactor();wc.sendInputEvent({type:'mouseMove',x:Math.round(target.x*zoom),y:Math.round(target.y*zoom)});
    // The hidden offscreen audit window may not receive OS cursor movement.
    // Dispatch to the renderer's hit-tested element, never directly to a
    // tooltip API or a target hidden behind another layer.
    await run(`const node=document.elementFromPoint(${target.x},${target.y});node?.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:${target.x},clientY:${target.y}}));`);
    await wait(`document.querySelector('#tooltipwrapper h2')?.textContent.includes('${target.name}')`,'Pokemon hover shows '+target.name);
    assert.ok(await run('const tip=document.querySelector("#tooltipwrapper .tooltip"),previous=tip.style.pointerEvents,r=tip.getBoundingClientRect();tip.style.pointerEvents="auto";const top=document.elementFromPoint(r.x+20,r.y+20)?.closest("#tooltipwrapper");tip.style.pointerEvents=previous;return r.width>0&&r.y>=0&&r.bottom<=innerHeight+2&&!!top;'),'Native Pokemon tooltip is visible above Theater panels');
   }
   wc.sendInputEvent({type:'mouseMove',x:1,y:1});await pause(30);
   // Native move handler, not a second choice system. Cancel afterwards.
   await run(`document.getElementById('room-${id}').querySelector('.movemenu button').click();`);await pause(150);
   assert.ok(await run('return __nativeSent.some(value=>String(value).includes("/choose move"));'),'Native move selection sends the original choice command');
   const forced=request(2);delete forced.active;forced.forceSwitch=[true];forced.side.pokemon[0].condition='0 fnt';
   await run(`${host}.receive(${JSON.stringify('>'+id+'\n|request|'+JSON.stringify(forced))});`);await pause(250);
   const switchSelector=version==='old'?'button[name=chooseSwitch][value="1"]':'button[data-cmd^="/switch 2"]';
   await wait(`document.getElementById('room-${id}').querySelector('${switchSelector}')`);
   await run(`document.getElementById('room-${id}').querySelector('${switchSelector}').click();`);await pause(150);
   assert.ok(await run('return __nativeSent.some(value=>String(value).includes("/choose switch"));'),'Forced switch uses the existing native handler');
   // Reinstall a request and confirm independent zoom and keyboard handling.
   await run(`${host}.receive(${JSON.stringify('>'+id+'\n|request|'+JSON.stringify(request(3)))});`);await pause(200);
   await wc.insertCSS(require('../app/client-zoom.cjs').showdexZoomCSS,{cssOrigin:'user'});wc.setZoomFactor(1.45);
   await run('document.documentElement.style.setProperty("--showdown-pro-showdex-zoom",String(125/145));');await pause(200);
   assert.ok(await run('return document.querySelector(".pro-theater-toggle").checkVisibility();'),'Toggle stays visible with separate Showdown and Showdex zoom');
   assert.ok(await run('const a=document.querySelector(".pro-theater-calcdex").getBoundingClientRect(),b=document.querySelector("[data-pro-theater-part=controls]").getBoundingClientRect();return a.x>=b.right&&a.right<=innerWidth+2;'),'Separate Showdex zoom does not shift the calculator over the battlefield');
   win.setContentSize(1920,1080);await pause(250);
   await run('const footer=document.querySelector("[data-pro-theater-part=chat-input]"),label=footer.querySelector("label");window.__theaterOriginalLabel=label.textContent;label.textContent="VeryLongStreamerUsername:";const extra=document.createElement("div");extra.id="theater-audit-scroll-content";extra.style.height="800px";document.querySelector("[data-pro-theater-part=controls]").append(extra);');await pause(200);
   assert.ok(await run('const root=document.querySelector(".pro-theater-room"),footer=root.querySelector("[data-pro-theater-part=chat-input]"),log=root.querySelector("[data-pro-theater-part=log]"),controls=root.querySelector("[data-pro-theater-part=controls]"),r=footer.getBoundingClientRect(),l=log.getBoundingClientRect(),c=controls.getBoundingClientRect(),box=footer.querySelector(".textbox:not([aria-hidden=true])").getBoundingClientRect();return Math.abs(l.right-r.right)<1&&Math.abs(l.bottom-r.y)<2&&box.right<=r.right-4&&controls.scrollHeight>controls.clientHeight&&!document.elementFromPoint(r.x+0.5,r.bottom-0.5)?.closest("[data-pro-theater-part=chat-input]")&&!document.elementFromPoint(c.right-0.5,c.y+0.5)?.closest("[data-pro-theater-part=controls]");'),'Chat composer fits the panel and rounded corners clip native controls/scrollbars');
   fs.writeFileSync(path.join(out,version+'-rounded-panels.png'),(await wc.capturePage()).toPNG());
   await run('document.getElementById("theater-audit-scroll-content").remove();document.querySelector("[data-pro-theater-part=chat-input] label").textContent=__theaterOriginalLabel;');await pause(200);
   fs.writeFileSync(path.join(out,version+'-zoom-controls.png'),(await wc.capturePage()).toPNG());
   await run("document.querySelector('.pro-theater-chat-header button').click();document.querySelector('.pro-theater-calc-header button[aria-label=\"Collapse Calcdex\"]').click();");await pause(250);
   assert.ok(await run('const root=document.querySelector(".pro-theater-room"),battle=root.querySelector(".battle").getBoundingClientRect(),tabs=[...root.querySelectorAll(".pro-theater-chat-header,.pro-theater-calc-header")].map(e=>e.getBoundingClientRect());return tabs.every(t=>Math.abs(t.width-36)<1&&t.x>=battle.right&&t.right<=innerWidth+1)&&tabs[0].bottom<=tabs[1].y&&innerWidth-battle.right<60;'),'Collapsed panels become narrow side tabs and reclaim the battle width');
   assert.ok(await run('return [...document.querySelectorAll("[data-pro-theater-part=users],[data-pro-theater-part=users-list]")].every(e=>getComputedStyle(e).visibility==="hidden");'),'Native chat headers disappear when collapsed');
   assert.equal(await run('return document.querySelector("[data-pro-theater-part=log]").checkVisibility();'),false,'Collapsed chat cannot paint descendants outside its tab');
   assert.ok(await run('return [...document.querySelector(".pro-theater-room").querySelectorAll(".userlist,.userlist-minimized,.battle-options")].every(e=>!e.checkVisibility());'),'Every native user/options toolbar disappears beside the closed chat tab');
   fs.writeFileSync(path.join(out,version+'-side-tabs.html'),await run('return document.documentElement.outerHTML;'));
   fs.writeFileSync(path.join(out,version+'-side-tabs.png'),(await wc.capturePage()).toPNG());
   await run("document.querySelector('.pro-theater-chat-header button').click();");await pause(150);
   assert.ok(await run('const log=document.querySelector("[data-pro-theater-part=log]").getBoundingClientRect(),tab=document.querySelector(".pro-theater-calc-header").getBoundingClientRect();const footer=document.querySelector("[data-pro-theater-part=chat-input]").getBoundingClientRect();return Math.abs(log.x-tab.x)<2&&Math.abs(log.width-tab.width)<2&&footer.bottom<=tab.y&&tab.bottom<=innerHeight&&Math.abs(tab.height-38)<1;'),'Collapsed Calcdex docks below full-width chat');
   fs.writeFileSync(path.join(out,version+'-chat-only.png'),(await wc.capturePage()).toPNG());
   await run("document.querySelector('.pro-theater-chat-header button').click();document.querySelector('.pro-theater-calc-header button[aria-label=\"Restore Calcdex\"]').click();");await pause(150);
   assert.ok(await run('const calc=document.querySelector(".pro-theater-calcdex").getBoundingClientRect(),tab=document.querySelector(".pro-theater-chat-header").getBoundingClientRect();const header=document.querySelector(".pro-theater-calc-header").getBoundingClientRect();return Math.abs(calc.x-tab.x)<2&&Math.abs(calc.width-tab.width)<2&&tab.bottom<=header.y&&calc.bottom<=innerHeight&&Math.abs(tab.height-38)<1;'),'Collapsed chat docks above full-width Calcdex');
   assert.ok(await run('const host=document.querySelector(".pro-theater-calcdex"),module=host.querySelector("[data-showdex-module=calcdex]"),ratio=parseFloat(getComputedStyle(module).zoom)||1;return host.clientWidth/ratio>=356;'),'A narrow saved column expands to fit native detail tables at the Showdex zoom');
   assert.ok(await run('const host=document.querySelector(".pro-theater-calcdex").getBoundingClientRect();return [...document.querySelectorAll(".pro-theater-calcdex [data-pro-calc=stats] > *, .pro-theater-calcdex [data-pro-calc=field] > *")].every(node=>node.getBoundingClientRect().right<=host.right-2);'),'Stat and field columns stay inside the docked panel');
   fs.writeFileSync(path.join(out,version+'-calc-only.png'),(await wc.capturePage()).toPNG());
   await run("document.querySelector('.pro-theater-calc-header button[aria-label=\"Collapse Calcdex\"]').click();");await pause(100);
   await run("document.querySelector('.pro-theater-chat-header button').click();document.querySelector('.pro-theater-calc-header button[aria-label=\"Restore Calcdex\"]').click();");await pause(150);
   wc.setZoomFactor(1);await run('document.documentElement.style.setProperty("--showdown-pro-showdex-zoom","1");');
   await run('const popup=document.createElement("div");popup.className="ps-popup";popup.textContent="Open popup";document.body.append(popup);document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
   assert.equal(await run('return !!__showdownProTheater.active;'),true,'Escape leaves an active popup alone');
   await run('document.querySelector(".ps-popup").remove();');
   await run(`${host}.receive(${JSON.stringify('>'+id+'\n|-weather|Sandstorm\n|-fieldstart|move: Electric Terrain\n|turn|2')});${host}.rooms['${id}'].battle.seekTurn(Infinity);`);await pause(150);
   assert.ok(await run(`const root=document.getElementById('room-${id}'),battle=root.querySelector('.battle').getBoundingClientRect();return [...root.querySelectorAll('.weather')].some(e=>{const r=e.getBoundingClientRect();return r.width>=battle.width*0.9&&r.height>=battle.height*0.9;});`),'Native weather fills the scaled scene');
   await run(`${host}.rooms['${id}'].battle.scene.backgroundEffect('#ffffff',800,0.4);`);await pause(100);
   assert.ok(await run('const a=document.querySelector("[data-pro-theater-part=field-effects] .background").getBoundingClientRect(),b=document.querySelector(".battle").getBoundingClientRect();return a.width>=b.width*0.99&&a.height>=b.height*0.99;'),'Move background flashes cover the full stage');
   const disabled=request(5);disabled.active[0].moves[0].disabled=true;
   await run(`${host}.receive(${JSON.stringify('>'+id+'\n|request|'+JSON.stringify(disabled))});`);await pause(150);
   assert.ok(await run(`return document.getElementById('room-${id}').querySelector('.movemenu button').matches(':disabled,.disabled');`),'Disabled moves retain native availability');
   const other='battle-gen9randombattle-998952';
   await run(`${host}.receive(${JSON.stringify('>'+other+'\n'+history().join('\n'))});${host}.focusRoom('${other}');`);
   await wait(`${host}.rooms['${other}']?.battle`);await run(`${host}.rooms['${other}'].battle.seekTurn(Infinity);`);await wait(`__showdownProTheater.active==='${other}'`);
   assert.ok(await run(`return ${host}.rooms['${id}'].battle===window.__theaterBattleInstance;`),'Background battle instance survives switching');
   const preview={rqid:6,teamPreview:true,side:request().side};
   await run(`${host}.receive(${JSON.stringify('>'+other+'\n|request|'+JSON.stringify(preview))});`);await pause(250);
   assert.ok(await run(`return document.getElementById('room-${other}').querySelector('.pro-theater-toggle').checkVisibility();`),'Toggle remains available through team preview');
   await run(`${host}.receive(${JSON.stringify('>'+other+'\n|win|ProTest')});${host}.rooms['${other}'].battle.seekTurn(Infinity);`);await pause(200);
   assert.ok(await run(`return document.getElementById('room-${other}').querySelector('.pro-theater-toggle').checkVisibility();`),'Replay/completion retains Theater access without a timer');
   assert.ok(await run(`const root=document.getElementById('room-${other}'),controls=root.querySelector('.battle-controls');return controls.offsetHeight<200&&controls.getBoundingClientRect().bottom<=innerHeight;`),'Replay controls are compact and leave more height for the battlefield');
   assert.ok(await run(`const e=document.getElementById('room-${other}').querySelector('.battle-controls');return e.scrollHeight<=e.clientHeight+1;`),'Completed replay controls fit without a scrollbar');
   const replay='battle-gen9randombattle-998953',replayHistory=history().filter(line=>!line.startsWith('|request|')).concat(['|move|p2a: Blastoise|Surf|p1a: Charizard','|-damage|p1a: Charizard|150/250','|turn|2','|move|p1a: Charizard|Air Slash|p2a: Blastoise','|-damage|p2a: Blastoise|70/100','|turn|3']);
   await run(`${host}.receive(${JSON.stringify('>'+replay+'\n'+replayHistory.join('\n'))});${host}.focusRoom('${replay}');`);
   await wait(`document.getElementById('room-${replay}')?.querySelector('.battle')`);
   await run(`${host}.rooms['${replay}'].battle.pause();${host}.rooms['${replay}'].battle.seekTurn(1,true);`);
   await wait(`__showdownProTheater.active==='${replay}'&&${host}.rooms['${replay}'].battle.turn===1&&${host}.rooms['${replay}'].battle.paused&&!${host}.rooms['${replay}'].battle.atQueueEnd`,'Paused replay is between turns');await pause(200);
   for(const zoom of [1,1.45]){
    win.setContentSize(1920,1080);wc.setZoomFactor(zoom);await pause(200);await run('__showdownProTheater.refresh();');await pause(100);
    assert.ok(await run(`const e=document.getElementById('room-${replay}').querySelector('.battle-controls');return e.textContent.includes('Skip to end')&&e.querySelectorAll('button').length>=4&&e.scrollHeight<=e.clientHeight+1&&e.getBoundingClientRect().bottom<=innerHeight+2;`),'Paused replay buttons fit at '+zoom+' zoom');
    if(zoom===1.45)fs.writeFileSync(path.join(out,version+'-replay-controls.png'),(await wc.capturePage()).toPNG());
   }
   wc.setZoomFactor(1);await pause(100);
   await run(`${host}.focusRoom('${id}');`);await wait(`__showdownProTheater.active==='${id}'`);
   await run('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
   assert.equal(await run('return __showdownProTheater.active;'),null,'Escape exits without an active modal');
   await run('document.body.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyT",ctrlKey:true,shiftKey:true,bubbles:true}));');await wait(`__showdownProTheater.active==='${id}'`);
   await run(`__showdownProTheater.exit();`);await pause(300);
   assert.equal(await run('return document.documentElement.classList.contains("pro-theater-active");'),false);
   assert.equal(await run(`return ${host}.rooms['${id}'].battle===window.__theaterBattleInstance;`),true,'Same battle instance survives layout changes');
   assert.equal(await run(`return (${host}.rightPanel||${host}.curSideRoom)?.id||null;`),normal.right,'Original right-side room restored');
   for(let i=0;i<5;i++){await run(`__showdownProTheater.toggle('${id}');`);await pause(50);await run('__showdownProTheater.exit();');}
   assert.equal(await run('return document.querySelectorAll(".pro-theater-calc-header").length;'),0);
   assert.ok(await run('return __savedTheater.length>0;'),'Layout collapse preferences saved through the app bridge');
   console.log(version+': toggle placement, resolutions, native controls, full calculator, collapse persistence and restoration passed.');
  }
  win.destroy();app.exit(0);
 }catch(error){console.error(await run('return __nativeSent.slice(-6);').catch(()=>null));console.error(await run("return Object.values((window.app||window.PS).rooms).filter(r=>r.battle).map(r=>({id:r.id,calc:r.battle.calcdexRoomId,overlay:r.battle.calcdexAsOverlay,init:r.battle.calcdexInit,state:r.battle.calcdexStateInit,renderer:typeof r.battle.calcdexReactRenderer}));").catch(()=>null));fs.writeFileSync(path.join(out,'failure.html'),await run('return document.documentElement.outerHTML;').catch(()=>''));fs.writeFileSync(path.join(out,'failure.png'),(await wc.capturePage()).toPNG());console.error(error);app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
