const {app,session,BrowserWindow}=require('electron');
require('./mute-test-audio.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {BrowserAddons}=require('../app/browser-addons.cjs');
const {addonDefaults}=require('../app/addon-catalog.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/history');
app.setPath('userData',path.join(out,'profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const ses=session.fromPartition('persist:history-audit'),manager=new BrowserAddons(root,ses);
 await manager.apply(Object.fromEntries(Object.keys(addonDefaults).map(key=>[key,key==='battleHistory' || key==='threeIsland'])));assert.equal(manager.errors.size,0);
 const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{session:ses,backgroundThrottling:false}}),wc=win.webContents;
 const run=code=>wc.executeJavaScript('(()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<200;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(50);}throw new Error('History timed out: '+code);};
 const errors=[],opened=[],downloads=[];
 wc.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
 wc.setWindowOpenHandler(({url})=>{opened.push(url);return {action:'deny'};});
 ses.on('will-download',(event,item)=>{downloads.push(item.getFilename());event.preventDefault();});
 const url=manager.optionsUrl('battleHistory');await win.loadURL(url);await wait('getComputedStyle(document.querySelector(".loading-overlay")).display==="none"');
 await run(`localStorage.setItem('lastSeenVersion','1.5.0');document.querySelector('.feature-notification').style.display='none';`);
 // Reset only this audit profile's extension database through its normal API.
 await run(`return new Promise(resolve=>chrome.runtime.sendMessage({action:'fetchBattles'},async result=>{for(const battle of result.battles)await new Promise(done=>chrome.runtime.sendMessage({action:'deleteBattle',battleId:battle.id},done));resolve();}));`);
 const team=['Charizard','Snorlax','Pikachu','Gengar','Dragonite','Blastoise'];
 const fixtures=Array.from({length:35},(_,i)=>({user:'ProTest',opponent:i===1?'Opponent With A Very Long Name':'Opponent '+(i+1),format:i<30?'[Gen 9] Random Battle':'[Gen 9] OU',serverId:'showdown',timestampUTC:new Date(Date.UTC(2026,9,1,12)-i*3600000).toISOString(),timestamp:'2026-10-01, 12:00',userrating_old:String(2250-i*4),userrating_new:String(2250-i*4+(i%3===1?-20:18)),opponentrating:String(2220-i*3),ratingdiff:i%3===1?'-20':'+18',gameResult:i%3===1?'loss':'win',userteam:team.join(' / '),userteam_new:team,opponentteam:team.join(' / '),opponentteam_random:team,userleads:['Charizard'],revealedteam:'Charizard @ Heavy-Duty Boots\nAbility: Blaze\n- Flamethrower\n- Air Slash',content:'|player|p1|ProTest\n|player|p2|Opponent\n|turn|1\n|move|p1a: Charizard|Flamethrower|p2a: Blastoise\n|win|ProTest',replayUrl:'https://replay.pokemonshowdown.com/gen9randombattle-'+(100+i)}));
 assert.equal((await run(`return new Promise(resolve=>chrome.runtime.sendMessage({action:'importBattles',battles:${JSON.stringify(fixtures)}},resolve));`)).success,true);
 await win.loadURL(url);await wait('document.querySelectorAll(".expandable-row").length===10 && document.querySelector(".history-summary strong").textContent==="30"');
 await run("window.confirm=()=>true;Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true});");
 const report=[];
 async function capture(name){await run('document.getAnimations().forEach(animation=>animation.finish());');await wc.capturePage();await pause(150);fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());}
 async function picker(selector,name) {
  assert.equal(await run(`return getComputedStyle(document.querySelector(${JSON.stringify(selector)})).appearance;`),'base-select');
  await wc.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).showPicker();`,true);
  assert.equal(await run(`return document.querySelector(${JSON.stringify(selector)}).matches(':open');`),true);
  await capture(name);
  wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await pause(50);
  assert.equal(await run(`return document.querySelector(${JSON.stringify(selector)}).matches(':open');`),false);
  const host=await run(`return document.querySelector(${JSON.stringify(selector)}).closest('.filter-modal')?.style.display;`);
  if(host!==undefined)assert.equal(host,'flex','Escape closes only the picker, leaving the dialog open');
 }
 for(const theme of ['pro','light','dark'])for(const width of [1100,760,420,320]) {
  win.setContentSize(width,760);await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.classList.toggle('dark-mode',${width===1100});scrollTo(0,0);`);await pause(180);
  const layout=await run(`const sidebar=document.getElementById('sidebar'),content=document.getElementById('content');return {overflow:document.documentElement.scrollWidth>innerWidth+1,sidebar:getComputedStyle(sidebar).backgroundColor,content:content.getBoundingClientRect().width,summary:[...document.querySelectorAll('.history-summary strong')].map(e=>e.textContent),chart:chart.data.datasets[0].borderColor,rows:document.querySelectorAll('.history-result').length};`);
  if(layout.overflow)console.log(await run(`return [...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1).slice(0,30);`));
  assert.equal(layout.overflow,false,theme+' '+width+' no page overflow');assert.deepEqual(layout.summary,['30','20','10','66.7%']);assert.equal(layout.rows,10);
  assert.equal(await run('return getComputedStyle(document.getElementById("content")).backgroundColor;'),theme==='pro'?'rgb(16, 35, 49)':theme==='light'?'rgb(243, 245, 247)':'rgb(32, 35, 39)');
  assert.equal(layout.chart,theme==='pro'?'#66c0f4':theme==='light'?'#216b9e':'#8abaf0');
  if(theme==='pro' || width===1100)await capture(theme+'-'+width);
  await run("document.querySelector('.history-settings-button').click();");
  const menuOverflow=await run(`const menu=document.querySelector('.settings-menu'),right=menu.getBoundingClientRect().right;return menu.scrollWidth>menu.clientWidth+1?[...menu.querySelectorAll('*')].map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>right-2):[];`);
  assert.deepEqual(menuOverflow,[],theme+' '+width+' settings stay within the menu');
  const menu=await run(`const e=document.querySelector('.settings-menu'),r=e.getBoundingClientRect();return {active:e.classList.contains('active'),within:r.right<=innerWidth+1 && r.left>=0 && r.bottom<=innerHeight+1,rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},hidden:getComputedStyle(document.getElementById('dark-mode-toggle')).display};`);
  assert.ok(menu.active && menu.within,JSON.stringify({theme,width,menu}));assert.equal(menu.hidden,'none');if(theme==='pro' && width===1100)await capture('settings');
  if([1100,320].includes(width)) {
   await picker('#history-theme','dropdown-theme-'+theme+'-'+width);
   await picker('#date-format-select','dropdown-date-'+theme+'-'+width);
  }
  await run("document.querySelector('.history-settings-button').click();document.getElementById('apply-filter-btn').click();");
  const modal=await run(`const e=document.querySelector('#filter-modal .filter-modal-content'),r=e.getBoundingClientRect();return {within:r.right<=innerWidth && r.left>=0 && r.top>=0 && r.bottom<=innerHeight,background:getComputedStyle(e).backgroundColor,overflow:e.scrollWidth>e.clientWidth+1};`);
  assert.ok(modal.within);assert.equal(modal.overflow,false);if(theme==='pro' && [1100,320].includes(width))await capture('filters-'+width);
  if(theme==='pro' && [1100,320].includes(width))await picker('#result-filter','dropdown-result-'+width);
  if([1100,320].includes(width)) {
   assert.equal(await run('return getComputedStyle(document.getElementById("favorites-filter")).appearance;'),'none');
   await run("document.getElementById('favorites-filter').click();");assert.equal(await run('return document.getElementById("favorites-filter").checked;'),true);
   if(theme==='pro')await capture('themed-filter-controls-'+width);
   await run("document.getElementById('favorites-filter').click();const rating=document.getElementById('rating-min');rating.value='1000';document.querySelector('#rating-min + .history-number-steps [data-step=up]').click();");
   assert.equal(await run('return document.getElementById("rating-min").value;'),'1001');
   await run("document.querySelector('#rating-min + .history-number-steps [data-step=down]').click();");assert.equal(await run('return document.getElementById("rating-min").value;'),'1000');
   await run("document.getElementById('rating-min').value='';document.getElementById('date-from').value='2024-02-28';document.querySelector('#date-from + .history-date-trigger').click();");
   const calendar=await run(`const e=document.getElementById('history-calendar'),r=e.getBoundingClientRect();return {open:e.matches(':popover-open'),within:r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight,days:e.querySelectorAll('.history-calendar-day').length};`);
   assert.ok(calendar.open && calendar.within);assert.equal(calendar.days,42);await capture('calendar-'+theme+'-'+width);
   await picker('#history-calendar select[aria-label="Month"]','calendar-month-'+theme+'-'+width);
   wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});await pause(50);
   assert.equal(await run('return document.getElementById("history-calendar").matches(":popover-open");'),false);assert.equal(await run('return document.getElementById("filter-modal").style.display;'),'flex');
   await run("document.querySelector('#date-from + .history-date-trigger').click();document.querySelector('[data-date=\"2024-02-28\"]').focus();");
   for(const keyCode of ['Right','Return']) {wc.sendInputEvent({type:'keyDown',keyCode});wc.sendInputEvent({type:'keyUp',keyCode});await pause(50);}
   assert.equal(await run('return document.getElementById("date-from").value;'),'2024-02-29');
   await run("document.querySelector('#date-from + .history-date-trigger').click();document.querySelector('[data-direction=next]').click();");assert.equal(await run('return document.querySelector("#history-calendar select[aria-label=Month]").value;'),'2');
   await run("document.querySelector('.history-calendar-footer button').click();");assert.equal(await run('return document.getElementById("date-from").value;'),'');
   await run("document.getElementById('date-to').value='2024-02-28';document.querySelector('#date-to + .history-date-trigger').click();document.querySelector('[data-date=\"2024-02-29\"]').click();");assert.equal(await run('return document.getElementById("date-to").value;'),'2024-02-29');
   await run("document.querySelector('#date-to + .history-date-trigger').click();document.querySelector('.history-calendar-footer button:last-child').click();");
   assert.equal(await run('return document.getElementById("date-to").value;'),await run("const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');"));
   await run("document.getElementById('date-to').value='';");
  }
  await run("document.querySelector('#filter-modal .filter-close-btn').click();");
  report.push({theme,width,layout,menu,modal});
 }
 win.setContentSize(1100,800);
 await run("document.documentElement.dataset.theme='pro';document.querySelector('.history-settings-button').click();");
 await wc.executeJavaScript("document.getElementById('history-theme').showPicker();",true);
 for(const keyCode of ['Down','Return']) {wc.sendInputEvent({type:'keyDown',keyCode});wc.sendInputEvent({type:'keyUp',keyCode});await pause(50);}
 assert.equal(await run('return document.documentElement.dataset.theme;'),'light','Native keyboard selection still changes the theme');
 await run("const select=document.getElementById('history-theme');select.value='pro';select.dispatchEvent(new Event('change'));document.querySelector('.history-settings-button').click();");
 win.setContentSize(1100,800);await run("document.documentElement.dataset.theme='pro';document.querySelector('.expandable-row').click();");
 await wait('document.querySelector(".expanded-content").style.display!=="none"');
 assert.equal(await run('return document.querySelector(".expandable-row").getAttribute("aria-expanded");'),'true');
 await run("document.querySelector('.expanded-content').scrollIntoView({block:'start'});");await capture('battle-details');
 await run("document.querySelector('.favorite-button').click();");await wait('document.querySelector(".favorite-button").classList.contains("active")');
 await run("document.querySelector('.battle-detail-button').click();document.querySelector('.battle-log-section').scrollIntoView({block:'center'});");await capture('battle-log');
 for(const width of [320,1100]) {win.setContentSize(width,760);await pause(150);await run("document.querySelector('.expanded-content').scrollIntoView({block:'start'});");assert.equal(await run('return document.documentElement.scrollWidth>innerWidth+1;'),false);await capture('battle-details-'+width);await run("document.querySelector('.battle-statistics').scrollIntoView({block:'start'});");assert.equal(await run('return document.documentElement.scrollWidth>innerWidth+1;'),false);await capture('summary-statistics-'+width);}
 await run("document.getElementById('next-page').click();");assert.match(await run('return document.getElementById("page-info").textContent;'),/2/);
 await run("document.getElementById('apply-filter-btn').click();document.getElementById('result-filter').value='win';document.getElementById('apply-filters-btn').click();");
 await wait('document.querySelector(".history-summary strong").textContent==="20"');assert.equal(await run('return document.querySelectorAll(".history-result[data-result=loss]").length;'),0);
 await run("document.getElementById('apply-filter-btn').click();document.getElementById('clear-filters-btn').click();document.querySelector('#filter-modal .filter-close-btn').click();");
 await wait('document.querySelector(".history-summary strong").textContent==="30"');
 await run("scrollTo(0,0);document.querySelector('.history-settings-button').click();for(const id of ['auto-save-checkbox','auto-battle-save-checkbox'])if(!document.getElementById(id).checked)document.getElementById(id).click();document.getElementById('export-battles').click();");
 await pause(200);assert.ok(downloads.length>0,'Export produces a download in the audit only');
 await run("document.querySelector('.history-settings-button').click();document.getElementById('import-replay').click();");await capture('replay-import');
 assert.equal(await run('return getComputedStyle(document.getElementById("replay-import-modal")).display;'),'flex');
 await run("document.querySelector('[data-close-replay-import]').click();document.querySelector('.pokemon-stats .show-all-rates').click();document.querySelector('.lead-stats .show-all-rates').click();");
 assert.equal(opened.length,2);
 const prefs=await run('return chrome.storage.local.get(["autoSave","autoBattleSave"]);');assert.equal(prefs.autoSave,true);assert.equal(prefs.autoBattleSave,true);
 for(const [index,subpage] of opened.entries()) {
  await win.loadURL(subpage);await wait('document.querySelectorAll(".pokemon-item").length>0');
  for(const width of [1100,320]) {win.setContentSize(width,760);await run("document.documentElement.dataset.theme='pro';");await pause(100);assert.equal(await run('return document.documentElement.scrollWidth>innerWidth+1;'),false);await capture('statistics-'+index+'-'+width);}
  await run("const search=document.getElementById('search-input');search.value='not-a-pokemon';search.dispatchEvent(new Event('input')); ");
  assert.equal(await run('return [...document.querySelectorAll(".pokemon-item")].some(item=>getComputedStyle(item).display!=="none");'),false);
 }
 await win.loadURL(manager.optionsUrl('threeIsland'));await wait('!document.getElementById("show-tera").disabled');
 for(const theme of ['pro','light','dark'])for(const width of [480,320]) {win.setContentSize(width,760);await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)};`);await pause(50);assert.equal(await run('return document.documentElement.scrollWidth>innerWidth+1;'),false);await picker('#show-tera','dropdown-three-island-'+theme+'-'+width);}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({layouts:report,dropdownKeyboard:true,addonDropdowns:true,themedCheckbox:true,ratingSteppers:true,calendarKeyboard:true,calendarLeapDay:true,calendarClearToday:true,filters:true,pagination:true,favorites:true,settingsPersistence:true,export:true,importDialog:true,statisticsSearch:true,errors},null,2));
 console.log('Battle History passed: 12 theme/layout cases, dialogs, chart palettes, rows, filters, pagination, favorites, settings, backup export and both searchable statistics pages.');app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
