const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {BrowserWindow} = require('electron');
const {history} = require('../tests/fixtures.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async (wc, root) => {
  wc.setBackgroundThrottling(false);
  const out = path.join(root, 'test-results/dropdown-controls');
  fs.mkdirSync(out, {recursive: true});
  const evaluate = code => wc.executeJavaScript('(async()=>{' + code + '})()', true);
  const wait = async code => {
    for(let n=0;n<120;n++) {
      if(await evaluate('return !!('+code+');').catch(()=>false)) return;
      await pause(200);
    }
    throw new Error('Timed out: '+code);
  };
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('DOM.enable');
  await wc.debugger.sendCommand('CSS.enable');
  const size = async width => {
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {width,height:950,deviceScaleFactor:1,mobile:false});
    await evaluate("window.dispatchEvent(new Event('resize'));");
    await pause(120);
  };
  const previews = new BrowserWindow({width:1100,height:950,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const pro = '@scope (html.showdown-pro){'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}';
  const fontCSS = fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style/font-awesome.css'),'utf8')+'\n@font-face{font-family:FontAwesome;src:url(data:font/woff2;base64,'+fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style/fonts/fontawesome-webfont.woff2')).toString('base64')+') format("woff2")}';
  const report = [];
  const capture = async (name,width,pickerSelector=null,scrollSelector=null) => {
    await pause(160);
    const data = await evaluate(`
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
      const selects=[...document.querySelectorAll('select')].filter(e=>e.checkVisibility()&&!e.closest('[data-showdex-module], [data-tippy-root]')).map(e=>{
        const s=getComputedStyle(e),icon=getComputedStyle(e,'::picker-icon');
        context.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;
        const text=e.selectedOptions[0]?.textContent.trim()||'';
        const customizable=s.appearance==='base-select';
        const iconWidth=customizable?(parseFloat(icon.width)||12):0;
        return {name:e.name,text,width:e.clientWidth,textWidth:context.measureText(text).width,
          available:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-iconWidth-(customizable?(parseFloat(s.columnGap)||0):0),
          before:getComputedStyle(e,'::before').content,after:getComputedStyle(e,'::after').content,icon:icon.display,appearance:s.appearance};
      });
      const body=document.body.cloneNode(true);body.querySelectorAll('script,iframe').forEach(e=>e.remove());
      const buttonMenus=[...document.querySelectorAll('button.select')].filter(e=>e.checkVisibility()&&!e.closest('[data-showdex-module], [data-tippy-root]')).map(e=>({name:e.name,padding:parseFloat(getComputedStyle(e).paddingRight),before:getComputedStyle(e,'::before').content,after:getComputedStyle(e,'::after').content,arrow:getComputedStyle(e,'::before').backgroundImage}));
      document.querySelectorAll('select').forEach((e,i)=>[...body.querySelectorAll('select')[i].options].forEach(o=>o.toggleAttribute('selected',o.value===e.value)));
      document.querySelectorAll('input').forEach((e,i)=>{const copy=body.querySelectorAll('input')[i];copy.setAttribute('value',e.value);copy.toggleAttribute('checked',e.checked);});
      const readCSS=sheet=>{try{return [...sheet.cssRules].map(rule=>rule.type===3&&rule.styleSheet?readCSS(rule.styleSheet):rule.cssText).join('\\n')}catch{return ''}};
      return {selects,buttonMenus,htmlClass:document.documentElement.className,body:body.outerHTML,
        directRows:[...document.querySelectorAll('table')].map(t=>[...t.children].some(e=>e.tagName==='TR')),
        css:[...document.styleSheets].map(readCSS).join('\\n')};
    `);
    report.push({name,width,selects:data.selects,buttonMenus:data.buttonMenus});
    fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
    for(const select of data.selects) {
      assert.equal(select.before,'none',name+' '+select.name+' legacy before arrow');
      assert.equal(select.after,'none',name+' '+select.name+' legacy after arrow');
      assert.ok(select.available>=select.textWidth-2,name+' '+select.name+' text/arrow overlap: '+JSON.stringify(select));
    }
    for(const menu of data.buttonMenus) {
      assert.ok(menu.padding>=30,name+' '+menu.name+' reserves space for its arrow');
      assert.equal(menu.after,'none');assert.equal(menu.before,'""');assert.match(menu.arrow,/svg/);
    }
    fs.writeFileSync(path.join(out,name+'-'+width+'.json'),JSON.stringify(data));
    previews.setContentSize(width,950);
    const loaded = new Promise(resolve=>previews.webContents.once('dom-ready',resolve));
    const preview = path.join(out,'preview.html');
    fs.writeFileSync(preview,'<!doctype html><html class="'+data.htmlClass+'"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; frame-src \'none\'"><base href="https://play.pokemonshowdown.com/"><style>'+data.css+fontCSS+'</style></head>'+data.body+'</html>');
    previews.loadFile(preview);await loaded;await previews.webContents.insertCSS(pro,{cssOrigin:'user'});
    await previews.webContents.executeJavaScript('document.querySelectorAll("table").forEach((table,i)=>{if('+JSON.stringify(data.directRows)+'[i])for(const section of [...table.children].filter(e=>e.tagName==="TBODY"))section.replaceWith(...section.children);});');
    if(scrollSelector) await previews.webContents.executeJavaScript('document.querySelector('+JSON.stringify(scrollSelector)+').scrollIntoView({block:"end"});');
    await pause(180);
    if(pickerSelector) {
      await previews.webContents.executeJavaScript('document.querySelector('+JSON.stringify(pickerSelector)+').showPicker();',true);
      await pause(150);
    }
    fs.writeFileSync(path.join(out,name+'-'+width+'.png'),(await previews.webContents.capturePage()).toPNG());
    console.log(name+' '+width+': '+data.selects.length+' dropdowns have one arrow and sufficient text space.');
  };
  try {
    await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}});app.addPopup(OptionsPopup);");
    const newUrl = await evaluate(`return document.querySelector('.ps-popup a[href="/newclient"]').href;`);
    if(process.argv.includes('--footer-only')) {
      await evaluate("app.closePopup();app.socket.send=()=>{};window.__showdownPro.setAutoTimer(false);app.focusRoom('');");
      const footerAudit=require('./audit-footer.cjs');
      await footerAudit({wc,evaluate,wait,size,capture,newClient:false});
      await wc.loadURL(newUrl);
      await wait('window.__showdownProTheme && window.PS?.roomTypes.options');
      await evaluate("PS.prefs.set('theme','pro');PS.send=()=>{};window.__showdownPro.setAutoTimer(false);");
      await footerAudit({wc,evaluate,wait,size,capture,newClient:true});
      console.log('Both client footers passed background credit, responsive layout, hover/focus and native theme checks.');
      return;
    }
    for(const width of [1100,430]) {await size(width);await capture('old-settings',width);}
    await evaluate("app.closePopup();app.socket.send=()=>{};window.__showdownPro.setAutoTimer(false);app.addRoom('teambuilder');app.focusRoom('teambuilder');const set={name:'',species:'Ceruledge',nature:'Serious',level:100,moves:[],evs:{},ivs:{}};window.dropdownSet=set;Storage.teams=[{name:'Dropdown audit',format:'gen9ou',capacity:6,team:Storage.packTeam([set]),folder:'',gen:9,dex:Dex.forGen(9)}];const r=app.rooms.teambuilder;r.teams=Storage.teams;r.curTeam=Storage.teams[0];r.curTeamLoc=0;r.curSetList=[set];r.formatResources||={};r.updateTeamView();");
    for(const type of ['stats','details']) {
      await evaluate("const r=app.rooms.teambuilder;r.curSet=dropdownSet;r.curSetLoc=0;r.updateSetView();r.curChartType="+JSON.stringify(type)+";r.curChartName="+JSON.stringify(type)+";r.updateChart(true);");
      for(const width of [1100,430]) {await size(width);await capture('old-'+type,width);}
    }
    const packedTeam = await evaluate('return Storage.packTeam([dropdownSet]);');
    await wc.loadURL(newUrl);
    await wait('window.__showdownProTheme && window.PS?.roomTypes.options && window.__showdownPro');
    await evaluate("PS.prefs.set('theme','pro');PS.send=()=>{};window.__showdownPro.setAutoTimer(false);PS.join('options');");
    for(const width of [1100,430]) {await size(width);await capture('new-settings',width);}
    await evaluate("PS.closePopupsAbove(null);const team={name:'Dropdown audit',format:'gen9ou',folder:'',packedTeam:"+JSON.stringify(packedTeam)+"};PS.teams.push(team);window.dropdownTeamId='team-'+team.key;PS.teams.update('team');PS.join(dropdownTeamId);PS.update();");
    if(process.argv.includes('--builder-surfaces')) return await require('./audit-builder-surfaces.cjs')({root,wc,evaluate,wait,size,capture});
    for(const type of ['stats','details']) {
      await evaluate("PS.focusRoom(dropdownTeamId);const e=PS.rooms[dropdownTeamId].editor;e.innerFocus={setIndex:0,type:"+JSON.stringify(type)+",typeIndex:-1};e.update();PS.rooms[dropdownTeamId].update(null);");
      await wait(type==='stats'?`document.querySelector('.set-stats-form select[name="nature"]')`:`document.querySelector('.set-details-form .showdown-pro-number-stepper')`);
      for(const width of [1100,430]) {await size(width);await capture('new-'+type,width);}
      if(type==='stats') {
        await evaluate("const s=document.querySelector('.set-stats-form select[name=nature]');s.value='Adamant';s.dispatchEvent(new Event('change',{bubbles:true}));");
        await capture('new-nature-long',430);
      } else {
        await evaluate("document.querySelector('.set-details-form button[data-step=down]').click();");
        assert.equal(await evaluate("return document.querySelector('.set-details-form input[name=level]').value;"),'99');
        await evaluate("document.querySelector('.set-details-form input[name=gender][value=F]').click();");
        assert.equal(await evaluate("return document.querySelectorAll('.set-details-form .showdown-pro-number-control').length;"),1,'One stepper after Preact updates');
        await evaluate("document.querySelector('.set-details-form button[data-step=up]').click();document.querySelector('.set-details-form button[data-step=up]').click();");
        assert.equal(await evaluate("return document.querySelector('.set-details-form input[name=level]').value;"),'100','Native maximum respected');
        for(const theme of ['light','dark']) {
          await evaluate('PS.prefs.set("theme",'+JSON.stringify(theme)+');');
          assert.equal(await evaluate("return getComputedStyle(document.querySelector('.set-details-form .showdown-pro-number-stepper')).display;"),'none','Custom stepper hidden in '+theme);
        }
        await evaluate("PS.prefs.set('theme','pro');");
        const native = await evaluate("const input=document.querySelector('.set-details-form input[name=level]');return {appearance:getComputedStyle(input).appearance,padding:parseFloat(getComputedStyle(input).paddingRight)};");
        assert.equal(native.appearance,'textfield');assert.ok(native.padding>=25,'Value reserves room for the stepper');
        assert.equal(await evaluate("return getComputedStyle(document.querySelector('.set-details-form .showdown-pro-number-control')).display;"),'block','Level retains the native stacked label layout');
      }
    }
    await evaluate("const e=PS.rooms[dropdownTeamId].editor;e.innerFocus=null;e.update();PS.rooms[dropdownTeamId].update(null);");
    await size(1100);await capture('new-coverage',1100);
    const battle='battle-gen9randombattle-999031';
    await evaluate('PS.receive('+JSON.stringify('>'+battle+'\n'+history().filter(line=>!line.startsWith('|request|')).join('\n'))+');PS.focusRoom('+JSON.stringify(battle)+');');
    await wait('PS.rooms['+JSON.stringify(battle)+'].battle');
    await evaluate('PS.rooms['+JSON.stringify(battle)+'].battle.seekTurn(Infinity);PS.receive('+JSON.stringify('>'+battle+'\n|expire|This room has expired (you cannot chat in it anymore)')+');');
    await capture('new-expired-room',1100);
    for(const id of ['rooms','battles']) {
      await evaluate('PS.join('+JSON.stringify(id)+');PS.update();');
      for(const width of [1100,430]) {await size(width);await capture('new-'+id,width);}
    }
    console.log('Dropdown geometry, level stepping/reconciliation, and native-theme isolation passed.');
  } finally {previews.destroy();}
};
