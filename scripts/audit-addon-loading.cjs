require('./mute-test-audio.cjs');
const {app,session,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),stageIndex=process.argv.indexOf('--update-stage'),stage=stageIndex>=0?path.resolve(process.argv[stageIndex+1]):null,out=process.env.SHOWDOWN_PRO_UPDATE_AUDIT_ROOT||path.join(stage||root,'test-results/addons');
fs.mkdirSync(out,{recursive:true});
const {BrowserAddons}=require('../app/browser-addons.cjs');
const {addonDefaults}=require('../app/addon-catalog.cjs');
const {isolateAuditNetwork,loadAuditClient}=require('./audit-client.cjs');
const {history,request}=require('../tests/fixtures.cjs');
app.setPath('userData',process.env.SHOWDOWN_PRO_UPDATE_PROFILE||path.join(out,'profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 const ses=session.fromPartition('persist:addons'),manager=new BrowserAddons(root,ses,()=>{},stage?{sourceRoot:path.join(stage,'browser-addons'),buildRoot:process.env.SHOWDOWN_PRO_UPDATE_BUILD_ROOT||path.join(stage,'build/browser-addons')}:{});
 isolateAuditNetwork(ses);
 await manager.apply(addonDefaults);
 assert.equal(manager.active.size,6);assert.equal(manager.errors.size,0);
 const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents,errors=[],report=[];
 const opened=[];wc.setWindowOpenHandler(({url})=>{opened.push(url);return {action:'deny'};});
 wc.on('console-message',details=>{if(details.level==='error'){errors.push(details.message);console.error(details.message.slice(0,500),details.sourceId,details.lineNumber);}else if(details.message.includes('Three Island'))console.log(details.message);});
 const evaluate=async code=>{try{return await wc.executeJavaScript('(()=>{'+code+'})()');}catch(error){throw new Error(code.slice(0,180)+': '+error.message);}};
 const waitFor=async code=>{for(let i=0;i<140;i++){if(await evaluate('return !!('+code+');').catch(()=>false))return;await pause(100);}throw new Error('Add-on timed out: '+code);};
 const settings=new BrowserWindow({show:false,webPreferences:{session:ses}});
 await settings.loadURL(manager.optionsUrl('enhancedTooltips'));
 await settings.webContents.executeJavaScript("chrome.storage.local.set({showBaseStats:'ON'})");
 await settings.loadURL(manager.optionsUrl('battleHistory'));
 await settings.webContents.executeJavaScript("chrome.storage.local.set({autoSave:false,autoBattleSave:false})");
 settings.close();
 const fetchHistory=async()=>{
  const stats=new BrowserWindow({show:false,webPreferences:{session:ses}});
  try {await stats.loadURL(manager.optionsUrl('battleHistory'));return await stats.webContents.executeJavaScript("new Promise(resolve=>chrome.runtime.sendMessage({action:'fetchBattles'},resolve))");}
  finally {stats.close();}
 };
 for(const client of ['old','new']) {
  await loadAuditClient(wc,'https://play.pokemonshowdown.com/'+(client==='old'?'oldclient':'newclient'));
  const host=client==='old'?'app':'PS',id='battle-gen9randombattle-'+(client==='old'?'555':'556');
  await waitFor(client==='old'?'window.app?.socket?.readyState===1 && window.BattleTooltips':'window.PS?.connection?.connected && window.BattleTooltips');
  await waitFor('document.getElementById("3I-STATE") && document.documentElement.hasAttribute("data-showdown-settings")');
  await waitFor('document.querySelector(".ps-stats-button")');
  assert.equal(await evaluate('return document.querySelectorAll(".ps-stats-button").length;'),1,client+' has one home history button');
  const historyMenu=await evaluate(`const button=document.querySelector('.ps-stats-button'),row=button.closest('p'),anchor=row.previousElementSibling,friend=anchor.querySelector('button[value="/friends"],a[href="view-friends-all"]'),r=button.getBoundingClientRect(),f=friend?.getBoundingClientRect();return {label:button.textContent.trim(),visible:button.checkVisibility(),friends:!!friend,next:row.nextElementSibling.textContent.trim(),aligned:Math.abs(r.left-f.left)<1 && Math.abs(r.width-f.width)<1};`);
  assert.equal(historyMenu.label,'Battle History');assert.equal(historyMenu.visible,true);assert.equal(historyMenu.friends,true);assert.equal(historyMenu.next,'Info & Resources');
  assert.equal(historyMenu.aligned,true,client+' history button aligns with Friends');
  if(!wc.debugger.isAttached())wc.debugger.attach('1.3');await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');
  assert.equal(await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8')),true);
  const proCSS='@scope (html.showdown-pro){'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}';
  await wc.insertCSS(proCSS,{cssOrigin:'user'});
  await evaluate(client==='old'?"OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}});":"PS.prefs.set('theme','pro');");await pause(100);
  const {root:documentNode}=await wc.debugger.sendCommand('DOM.getDocument'),nodes=[];
  for(const selector of ['.ps-stats-button',client==='old'?'#room- button[value="/friends"]':'#room- a[href="view-friends-all"]'])nodes.push((await wc.debugger.sendCommand('DOM.querySelector',{nodeId:documentNode.nodeId,selector})).nodeId);
  const menuColors=[];
  for(const state of [[],['hover'],['active'],['focus','focus-visible']]) {
   for(const nodeId of nodes)await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state});await pause(50);
   const colors=await evaluate(`const history=document.querySelector('.ps-stats-button'),friend=history.closest('p').previousElementSibling.querySelector('button,a'),properties=['backgroundColor','backgroundImage','color','borderTopColor','boxShadow','textShadow','outlineColor','outlineStyle'];return [history,friend].map(e=>Object.fromEntries(properties.map(key=>[key,getComputedStyle(e)[key]])));`);
   assert.deepEqual(colors[0],colors[1],client+' history matches Friends in '+(state.join('/') || 'normal')+' state');menuColors.push({state,colors:colors[0]});
  }
  for(const nodeId of nodes)await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
  console.log(client+': history menu matches normal, hover, pressed and focus colors');
  await evaluate("document.querySelector('.ps-stats-button').scrollIntoView({block:'center'});");await wc.capturePage();await pause(150);
  fs.writeFileSync(path.join(out,client+'-history-menu-pro.png'),(await wc.capturePage()).toPNG());
  await evaluate('document.querySelector(".ps-stats-button").click();');
  for(let i=0;i<30 && !opened.some(url=>url.includes('/stats.html'));i++)await pause(50);
  const historyUrl=opened.find(url=>url.includes('/stats.html'));assert.ok(historyUrl,client+' opens history');assert.equal(historyUrl,manager.optionsUrl('battleHistory'));opened.length=0;
  if(client==='new') {
   await evaluate("PS.rooms[''].update(null);");await pause(150);assert.equal(await evaluate('return document.querySelectorAll(".ps-stats-button").length;'),1,'New client render keeps a single history button');
   await evaluate("document.querySelector('.ps-stats-button').closest('p').remove();PS.rooms[''].update(null);");await waitFor('document.querySelectorAll(".ps-stats-button").length===1');
  }
  await waitFor('window.DATA?.gen9randombattle');
  const level=await evaluate('return Number(Object.entries(DATA.gen9randombattle).find(([,value])=>value.blastoise)?.[0]);');
  assert.ok(level>0);
  await evaluate(`window.__addonSends=[];${client==='old'?'app.socket.send':'PS.connection.send'}=data=>__addonSends.push(data);
    ${client==='old'?"Storage.prefs('autotimer',false); app.user.set({name:'ProTest',named:true});":"PS.prefs.set('autotimer',false); PS.user.name='ProTest';PS.user.named=true;"}
    window.__pasteRequests=[];const fetchOriginal=window.fetch;window.fetch=(url,...args)=>String(url).includes('pokepast.es/addonaudit')?Promise.resolve(new Response(JSON.stringify({title:'Addon audit',notes:'Format: gen9ou',paste:'Pikachu @ Light Ball\\nAbility: Static\\n- Thunderbolt'}),{headers:{'Content-Type':'application/json'}})):fetchOriginal(url,...args);
    window.open=url=>{__pasteRequests.push(url);return null;};
    ${host}.receive(${JSON.stringify('>'+id+'\n'+history(request()).join('\n').replace('|start','|rated|\n|start').replace('Blastoise, L84','Blastoise, L'+level))});${host}.focusRoom(${JSON.stringify(id)});`);
  await waitFor(`${host}.rooms[${JSON.stringify(id)}]?.battle`);
  await evaluate(`${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
  await waitFor(`${host}.rooms[${JSON.stringify(id)}].battle.farSide.pokemon.length`);
  await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n|request|'+JSON.stringify(request()))});${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
  const tip=await evaluate(`const room=${host}.rooms[${JSON.stringify(id)}],tips=room.tooltips||new BattleTooltips(room.battle);return tips.showPokemonTooltip(room.battle.farSide.pokemon[0]);`);
  fs.writeFileSync(path.join(out,client+'-tooltip.html'),tip);
  assert.match(tip,/Base [Ss]tats|Base [Ss]tat|BST/);assert.match(tip,/Setup Sweeper|Tera Blast user/);
  console.log(client+' tooltip:',tip.replace(/<[^>]+>/g,' ').slice(-650));
  const teraTooltips=await evaluate(`const room=${host}.rooms[${JSON.stringify(id)}],battle=room.battle,tips=room.tooltips||new BattleTooltips(battle);
    const own=battle.myPokemon[0],opponent=battle.farSide.pokemon[0];
    const teraOpponent=Object.assign(Object.create(Object.getPrototypeOf(opponent)),opponent,{teraType:'Fire',terastallized:'Fire'});
    const cases=[
      ['own-active',battle.nearSide.pokemon[0],{...own,teraType:'Poison'},true],
      ['own-switch',null,{...own,teraType:'Poison'},false],
      ['own-stellar',null,{...own,teraType:'Stellar'},false],
      ['own-terastallized',null,{...own,teraType:'Poison',terastallized:'Poison'},false],
      ['opponent-unknown',opponent,null,true],
      ['opponent-revealed',teraOpponent,null,true],
    ];
    return cases.map(([name,pokemon,server,active])=>{
      const html=tips.showPokemonTooltip(pokemon,server,active),doc=new DOMParser().parseFromString(html,'text/html'),header=doc.querySelector('h2');
      return {name,html,header:header.textContent,types:[...header.querySelectorAll('img')].filter(img=>img.src.includes('/types/')).map(img=>img.alt)};
    });`);
  for(const entry of teraTooltips) {
    if(entry.name==='opponent-unknown')assert.doesNotMatch(entry.header,/Tera/,client+' hides unknown opponent Tera');
    else if(entry.name.endsWith('terastallized') || entry.name==='opponent-revealed') {
      assert.match(entry.header,/Terastallized/);assert.match(entry.header,/base:/);
      assert.ok(entry.types.includes(entry.name==='opponent-revealed'?'Fire':'Poison'));
    } else {
      assert.match(entry.header,/Tera/);
      assert.ok(entry.types.includes(entry.name==='own-stellar'?'Stellar':'Poison'),client+'/'+entry.name+' includes its known Tera icon');
    }
  }
  for(const theme of ['light','dark','pro']) {
    await evaluate(client==='old'?`OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(theme)}}});`:`PS.prefs.set('theme',${JSON.stringify(theme)});`);
    for(const width of [1100,430]) {
      win.setContentSize(width,800);await pause(200);
      await evaluate(`const room=${host}.rooms[${JSON.stringify(id)}],tips=room.tooltips||new BattleTooltips(room.battle);tips.placeTooltip(${JSON.stringify(teraTooltips[1].html)});`);
      const icon=await evaluate(`const heading=document.querySelector('#tooltipwrapper h2'),icon=[...heading.querySelectorAll('img')].find(img=>img.alt==='Poison'),r=icon.getBoundingClientRect(),h=heading.getBoundingClientRect();return {visible:icon.checkVisibility()&&r.width>0&&r.height>0,insideHeader:r.left>=h.left&&r.right<=h.right&&r.top>=h.top&&r.bottom<=h.bottom};`);
      assert.equal(icon.visible,true,client+'/'+theme+'/'+width+' Tera icon visible');assert.equal(icon.insideHeader,true,client+'/'+theme+'/'+width+' Tera icon fits header');
      if(theme==='pro')fs.writeFileSync(path.join(out,client+'-tera-tooltip-'+width+'.png'),(await wc.capturePage()).toPNG());
      await evaluate('BattleTooltips.hideTooltip();');
    }
  }
  fs.writeFileSync(path.join(out,client+'-tera-tooltips.json'),JSON.stringify(teraTooltips,null,2));
  win.setContentSize(1100,800);await pause(150);
  await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n|c| Other|https://pokepast.es/addonaudit0001')});`);
  await pause(500);fs.writeFileSync(path.join(out,client+'-chat.html'),await evaluate(`return document.getElementById('room-'+${JSON.stringify(id)}).outerHTML;`));
  await waitFor('document.querySelector(".threeisland-link .threeisland-set")');
  const before=await evaluate(`return ${client==='old'?'Storage.teams.length':'PS.teams.list.length'};`);
  await evaluate('document.querySelector(".threeisland-link button").click();');
  await waitFor(`${client==='old'?'Storage.teams.length':'PS.teams.list.length'}===${before+1}`);
  const imported=await evaluate(`return ${client==='old'?'Storage.teams[0]':'PS.teams.list[0]'};`);
  assert.ok(JSON.stringify(imported).includes('Pikachu') || JSON.stringify(imported).includes('pikachu'));
  await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n|-terastallize|p2a: Blastoise|Fire')});${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
  await waitFor('document.querySelector(".ditTeraInfo")?.textContent.includes("Blastoise")');
  await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n|raw|<div class="infobox"><details><summary>Opponent’s open team sheet</summary>Blastoise @ Leftovers<br>Ability: Torrent<br>- Surf<br></details></div>')});`);
  await waitFor('document.querySelector("button[name=exportPasteButton]:not(:disabled)")');
  const exportPlacement=[];
  for(const width of client==='new'?[1100,900,680]:[1100]) {
   win.setContentSize(width,800);await pause(200);
   await evaluate(`const room=document.getElementById('room-'+${JSON.stringify(id)});room.querySelector('button[name="showChat"]')?.click();const log=room.querySelector('.battle-log');log.scrollTop=0;`);await pause(100);
   const placement=await evaluate(`const room=document.getElementById('room-'+${JSON.stringify(id)}),button=room.querySelector('button[name="exportPasteButton"]'),r=button.getBoundingClientRect(),log=room.querySelector('.battle-log').getBoundingClientRect(),front=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {buttons:room.querySelectorAll('button[name="exportPasteButton"]').length,visible:button.checkVisibility(),reachable:front===button||button.contains(front),left:r.left,right:r.right,top:r.top,bottom:r.bottom,logLeft:log.left,logRight:log.right,normalFlow:!!button.closest('.pro-team-sheet-export')};`);
   assert.equal(placement.buttons,1);assert.equal(placement.visible,true,client+' exporter visible at '+width);assert.equal(placement.reachable,true,client+' exporter is not covered at '+width);
   assert.ok(placement.left>=placement.logLeft && placement.right<=placement.logRight,client+' exporter fits chat at '+width);
   if(client==='new')assert.equal(placement.normalFlow,true);
   exportPlacement.push({width,...placement});
  }
  win.setContentSize(1100,800);await pause(150);
  if(client==='new') {
   await evaluate(`${host}.rooms[${JSON.stringify(id)}].update(null);`);await pause(200);
   assert.equal(await evaluate(`return document.getElementById('room-'+${JSON.stringify(id)}).querySelectorAll('button[name="exportPasteButton"]').length;`),1,'Exporter survives new client rerender');
  }
  await wc.capturePage();await pause(150);fs.writeFileSync(path.join(out,client+'-exporter-pro.png'),(await wc.capturePage()).toPNG());
  await evaluate('document.querySelector("button[name=exportPasteButton]:not(:disabled)").click();');
  for(let i=0;i<30 && !opened.some(url=>url.startsWith('https://pokepast.es/create'));i++)await pause(100);
  const exported=opened.findLast(url=>url.startsWith('https://pokepast.es/create'));opened.length=0;
  assert.equal(new URL(exported).hostname,'pokepast.es');assert.match(new URL(exported).searchParams.get('paste'),/Blastoise @ Leftovers\nAbility: Torrent\n- Surf/);
  await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n|win|ProTest')});${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
  fs.writeFileSync(path.join(out,client+'-finished.html'),await evaluate(`return document.getElementById('room-'+${JSON.stringify(id)}).outerHTML;`));
  await waitFor('document.querySelector(".ps-save-battle-button")');
  const savedBefore=(await fetchHistory()).battles.length;
  await evaluate('document.querySelector(".ps-save-battle-button").click();');
  await waitFor(`!${host}.rooms[${JSON.stringify(id)}]`);
  const saved=await fetchHistory();assert.equal(saved.success,true);assert.equal(saved.battles.length,savedBefore+1);assert.ok(saved.battles.some(b=>b.opponent==='Opponent'));
  report.push({client,loaded:6,tooltip:tip.length,preview:true,import:true,tera:true,export:true,exportPlacement,history:true,historyMenu,menuColors});
  console.log(client+': paste preview/import, Tera, team sheet export and saved history passed');
 }
 await manager.apply(Object.fromEntries(Object.keys(addonDefaults).map(key=>[key,false])));
 assert.equal(manager.active.size,0);
 await loadAuditClient(wc,'https://play.pokemonshowdown.com/oldclient');await pause(1500);
 assert.equal(await evaluate('return !!document.getElementById("3I-STATE");'),false);
 assert.equal(await evaluate('return document.documentElement.hasAttribute("data-showdown-settings");'),false);
 assert.equal(await evaluate('return !!document.querySelector(".ps-stats-button");'),false);
 await manager.apply(addonDefaults);
 const prefs=new BrowserWindow({show:false,webPreferences:{session:ses}});
 await prefs.loadURL(manager.optionsUrl('enhancedTooltips'));
 assert.equal((await prefs.webContents.executeJavaScript("chrome.storage.local.get('showBaseStats')")).showBaseStats,'ON');prefs.close();
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({clients:report,unloaded:true,persisted:true,errors},null,2));
 console.log('All six add-ons passed, with disable/reload and settings persistence');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
