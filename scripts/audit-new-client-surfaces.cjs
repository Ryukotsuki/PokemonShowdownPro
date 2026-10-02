const fs = require('node:fs');
const path = require('node:path');
const {history} = require('../tests/fixtures.cjs');
const {request} = require('../tests/fixtures.cjs');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async (wc, root) => {
  wc.setBackgroundThrottling(false);
  if(process.argv.includes('--cached-surfaces'))return require('./verify-new-client-surfaces.cjs')(root);
  const out = path.join(root, 'test-results/new-surfaces');
  fs.mkdirSync(out, {recursive:true});
  const evaluate = code => wc.executeJavaScript('(async()=>{' + code + '})()');
  const wait = async code => {
    for(let n=0;n<120;n++) {if(await evaluate('return !!('+code+');').catch(()=>false))return; await pause(250);}
    throw new Error('Timed out: '+code);
  };
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('DOM.enable');
  await wc.debugger.sendCommand('CSS.enable');
  const size = async width => {
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
    await evaluate("window.dispatchEvent(new Event('resize'));");
    await pause(120);
  };
  const report=[];
  const snapshot=async name=>{
    await pause(160);
    const data=await evaluate(String.raw`
      const visible=el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>2&&r.height>2&&s.visibility!=='hidden'&&s.display!=='none';};
      const neutral=value=>{const n=value.match(/[\d.]+/g)?.map(Number);return n&&n.length>=3&&(n.length<4||n[3]>.2)&&Math.max(...n.slice(0,3))-Math.min(...n.slice(0,3))<10;};
      const bright=value=>{const n=value.match(/[\d.]+/g)?.map(Number);return n&&n.length>=3&&(n.length<4||n[3]>.2)&&n[0]>180&&n[1]>140&&n[2]<110;};
      const seen=new Set(),issues=[];
      for(const el of document.querySelectorAll(':is(.header, .header-vertical, .mini-header), :is(.header, .header-vertical, .mini-header) *, .ps-popup *, .ps-room *, .mini-window *')){
        if(!visible(el)||el.closest('[data-showdex-scheme]')||el.matches('img, svg, svg *, .picon, .pokemonicon, .trainer, .backdrop, .hp, .hptext, .hptextborder, .statgraph span, .setstatbar span'))continue;
        const s=getComputedStyle(el),colors=s.backgroundImage.match(/rgba?\([^)]+\)/g)||[];
        const native=el.matches('button, select, input[type=checkbox], input[type=radio], input[type=range]')&&['auto','button','checkbox','radio','slider-horizontal','menulist'].includes(s.appearance);
        if(!native&&!neutral(s.backgroundColor)&&!bright(s.backgroundColor)&&!(colors.length&&(colors.every(neutral)||colors.some(bright))))continue;
        const key=el.tagName+'.'+el.className+':'+s.backgroundColor+':'+s.backgroundImage+':'+s.appearance;
        if(seen.has(key))continue;seen.add(key);
        issues.push({tag:el.tagName,class:el.className,name:el.getAttribute('name'),text:el.textContent.slice(0,90),background:s.backgroundColor,image:s.backgroundImage,appearance:s.appearance,html:el.outerHTML.slice(0,500)});
      }
      const body=document.body.cloneNode(true);
      body.querySelectorAll('script,iframe').forEach(el=>el.remove());
      document.querySelectorAll('select').forEach((sel,i)=>[...body.querySelectorAll('select')[i].options].forEach(o=>o.toggleAttribute('selected',o.value===sel.value)));
      document.querySelectorAll('input').forEach((input,i)=>{const copy=body.querySelectorAll('input')[i];copy.setAttribute('value',input.value);copy.toggleAttribute('checked',input.checked);});
      document.querySelectorAll('textarea').forEach((input,i)=>{body.querySelectorAll('textarea')[i].textContent=input.value;});
      const readCSS=sheet=>{try{return [...sheet.cssRules].map(rule=>rule.type===3&&rule.styleSheet?readCSS(rule.styleSheet):rule.cssText).join('\n')}catch{return ''}};
      return {issues,width:innerWidth,height:innerHeight,htmlClass:document.documentElement.className,body:body.outerHTML,directRowTables:[...document.querySelectorAll('table')].map(table=>[...table.children].some(child=>child.tagName==='TR')),css:[...document.styleSheets].map(readCSS).join('\n')};
    `);
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data));
    report.push({name,issues:data.issues});
    fs.writeFileSync(path.join(out,process.argv.includes('--new-ladder-only')?'ladder-audit.json':'audit.json'),JSON.stringify(report,null,2));
    console.log(name+': '+data.issues.length+' surfaces to review');
  };
  const open=async id=>{
    await evaluate("PS.closePopupsAbove(null); PS.join("+JSON.stringify(id)+"); PS.update();");
    await pause(200);
  };
  await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}}); app.addPopup(OptionsPopup);");
  const newUrl=await evaluate('return document.querySelector(\'.ps-popup a[href="/newclient"]\').href;');
  await evaluate("app.closePopup(); app.socket.send=()=>{}; for(const id of ['teambuilder','ladder','battles','rooms','resources'])app.addRoom(id);app.focusRoom('rooms');");
  await size(430);await snapshot('old-overflow');
  assert.equal(await evaluate("return getComputedStyle(document.querySelector('.overflow button')).appearance;"),'none');
  await evaluate("document.querySelector('.overflow button').click();");
  await snapshot('old-tabs');
  assert.ok(await evaluate("return !!document.querySelector('.ps-popup:is(.tablist, :has(.tablist))');"));
  await wc.loadURL(newUrl);
  await wait('window.__showdownProTheme && window.PS?.roomTypes.options && document.getElementById("showdown-pro-theme")');
  await evaluate("PS.prefs.set('theme','pro');window.__showdownPro.setAutoTimer(false);");
  await size(1200);
  if(process.argv.includes('--new-ladder-only'))return require('./audit-new-ladder.cjs')({root,evaluate,wait,size,open,snapshot});
  await snapshot('home');
  for(const id of ['options','volume','login','avatars','changebackground','chatformatting','battleoptions','roomtablist','user-audittest','useroptions-audittest','changepassword','register']){
    try {await open(id);await snapshot(id);}catch(error){console.log(id+': '+error.message);}
  }
  await open('options');
  assert.equal(await evaluate('return getComputedStyle(document.querySelector(".construction")).backgroundColor;'),'rgb(27, 57, 77)','Client-version notice uses Pro palette');
  await evaluate("[...document.querySelectorAll('.ps-popup button')].find(e=>e.textContent==='Add status')?.click();");
  await snapshot('status');
  await evaluate("PS.closePopupsAbove(null);PS.focusRoom('');");
  for(const selector of ['button[name=format]','button[name=team]']){
    await evaluate("document.querySelector("+JSON.stringify(selector)+")?.click();");
    await snapshot(selector.includes('format')?'formats':'team-dropdown');
    await evaluate("PS.closePopupsAbove(null);PS.update();");
  }
  for(const id of ['rooms','battles','ladder','ladder-gen9randombattle','view-tournaments-all','view-seasonladder','resources','teambuilder']){
    try{await open(id);await pause(900);await snapshot(id);}catch(error){console.log(id+': '+error.message);}
  }
  // Capture the actual Preact server-page wrappers with saved public HTML.
  const tournamentDir=path.join(root,'test-results/tournaments-theme');
  for(const file of fs.readdirSync(tournamentDir).filter(f=>f.endsWith('.html'))){
    const id=file.slice(0,-5);await open(id);
    await evaluate('PS.rooms['+JSON.stringify(id)+'].setHTMLData('+JSON.stringify(fs.readFileSync(path.join(tournamentDir,file),'utf8'))+');PS.update();');
    await snapshot('page-'+id);
  }
  const season=JSON.parse(fs.readFileSync(path.join(root,'test-results/builder-theme/seasons.json'),'utf8'));
  await open('view-seasonladder');
  await evaluate('PS.rooms["view-seasonladder"].setHTMLData('+JSON.stringify(season.html)+');PS.update();');
  await snapshot('season-records');
  await open('view-ladderhelp');await snapshot('ladder-help');
  // Synthetic local battle/chat content: no moves or chat messages reach the server.
  await evaluate("PS.send=()=>{};");
  await evaluate("const team={name:'Theme audit',format:'gen9ou',folder:'',packedTeam:'Alomomola||Leftovers|Regenerator|Wish,Protect,Flip Turn,Scald|Bold|252,0,252,0,4,0|||||Water'};PS.teams.push(team);window.auditTeamKey=team.key;PS.teams.update('team');");
  await open('teambuilder');await snapshot('teams-populated');
  const teamId=await evaluate("return 'team-'+auditTeamKey;");
  await open(teamId);await snapshot('team-editor');
  for(const type of ['pokemon','item','ability','move','stats','details','import']){
    await evaluate("const e=PS.rooms["+JSON.stringify(teamId)+"].editor;e.innerFocus={setIndex:0,type:"+JSON.stringify(type)+",typeIndex:"+(type==='move'?0:-1)+"};e.update();PS.rooms["+JSON.stringify(teamId)+"].update(null);");
    await pause(200);await snapshot('pokemon-'+type);
  }
  await open('teamstorage-'+await evaluate('return auditTeamKey;'));await snapshot('team-storage');
  const battle='battle-gen9randombattle-999001';
  await evaluate("PS.receive("+JSON.stringify('>'+battle+'\n'+history().filter(l=>!l.startsWith('|request|')).join('\n'))+");PS.focusRoom("+JSON.stringify(battle)+");");
  await wait('PS.rooms['+JSON.stringify(battle)+'].battle');
  await evaluate('PS.rooms['+JSON.stringify(battle)+'].battle.seekTurn(Infinity);');
  await pause(600);await snapshot('battle');
  await evaluate('PS.closePopupsAbove(null);PS.rooms['+JSON.stringify(battle)+'].receiveRequest('+JSON.stringify(request())+');PS.rooms['+JSON.stringify(battle)+'].update(null);');
  await snapshot('battle-controls');
  await open('battleoptions');await snapshot('battle-options');
  for(const id of ['forfeitbattle','battletimer','confirmleaveroom','replaceplayer']){
    await evaluate('PS.closePopupsAbove(null);PS.focusRoom('+JSON.stringify(battle)+');PS.join('+JSON.stringify(id)+',{parentRoomid:'+JSON.stringify(battle)+'});PS.update();');
    await snapshot(id);
  }
  await open('rules-audit');await snapshot('rules');
  await evaluate('PS.closePopupsAbove(null);PS.join("popup-parity",{args:{message:"A client notice with more information.",type:"text",label:"Name",okButton:"Continue",cancelButton:"Cancel"}});PS.update();');
  await snapshot('prompt');
  await evaluate("PS.closePopupsAbove(null);PS.receive('>themeaudit\\n|init|chat\\n|title|Theme audit\\n|users|2,@Audit User,+Another User\\n|c|@Audit User|Sample chat message\\n|html|<div class=\"infobox\"><button class=\"button\">Room action</button><button>Plain room button</button><details><summary>Room details</summary>More information</details></div>');PS.focusRoom('themeaudit');");
  await snapshot('chat');
  await evaluate("PS.receive('>themeaudit\\n|tournament|create|gen9ou|elimination|8\\n|tournament|update|{\"isJoined\":true,\"isStarted\":false,\"users\":[\"Audit User\",\"Another User\"]}\\n|tournament|updateEnd');PS.update();");
  await snapshot('chat-tournament');
  await evaluate('PS.closePopupsAbove(null);PS.focusRoom("themeaudit");PS.join("userlist",{parentRoomid:"themeaudit"});PS.update();');
  await snapshot('userlist');
  await evaluate('PS.closePopupsAbove(null);PS.focusRoom("themeaudit");');
  const roomFixtures=path.join(root,'test-results/chat-theme/rooms.json');
  const savedRooms=fs.existsSync(roomFixtures)?JSON.parse(fs.readFileSync(roomFixtures,'utf8')):[];
  console.log('Public room fixtures: '+savedRooms.length);
  const controls=[...new Set(savedRooms.flatMap(r=>(r.controls||[]).map(c=>c.html)))];
  await evaluate('PS.receive('+JSON.stringify('>themeaudit\n|html|<div class="infobox">'+controls.map(html=>'<div>'+html.replace(/\n/g,' ')+'</div>').join('')+'</div>')+');');
  await snapshot('public-room-controls');
  await open('dm-audittest');await snapshot('direct-message');
  await evaluate("PS.rooms['dm-audittest'].openChallenge();PS.update();");await snapshot('challenge');
  for(const width of [430,800]){
    await size(width);
    await open('rooms');await snapshot('rooms-'+width);
    await open('roomtablist');await snapshot('tabs-'+width);
    assert.ok(await evaluate("return [...document.querySelectorAll(':is(.header,.header-vertical,.mini-header) button')].every(button=>getComputedStyle(button).appearance==='none');"));
    await open('teambuilder');await snapshot('builder-'+width);
    await open('options');await snapshot('settings-'+width);
    await open(teamId);await snapshot('pokemon-'+width);
    await open('view-tournaments-all');await snapshot('tournaments-'+width);
    await open('view-seasonladder');await snapshot('seasons-'+width);
  }
  fs.writeFileSync(path.join(out,'routes.json'),JSON.stringify(await evaluate("return Object.entries(PS.roomTypes).map(([id,panel])=>({id,routes:panel.routes}));"),null,2));
  assert.equal(report.reduce((count,scene)=>count+scene.issues.length,0),0,'Unreviewed native controls or neutral surfaces remain; see new-surfaces/audit.json');
  console.log('New-client surface audit captured.');
};

