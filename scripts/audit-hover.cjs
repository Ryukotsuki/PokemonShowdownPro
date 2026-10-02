const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {BrowserWindow}=require('electron');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async(wc,root)=>{
  const out=path.join(root,'test-results/hover-theme');fs.mkdirSync(out,{recursive:true});
  wc.setBackgroundThrottling(false);
  const evaluate=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
  const wait=async code=>{for(let n=0;n<160;n++){if(await evaluate('return !!('+code+');').catch(()=>false))return;await pause(250);}throw new Error('Hover audit timed out: '+code);};
  wc.debugger.attach('1.3');await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');
  await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}});app.addPopup(OptionsPopup);");
  const newUrl=await evaluate('return document.querySelector(\'.ps-popup a[href="/newclient"]\').href;');
  await evaluate('app.closePopup();app.socket.send=()=>{};');
  const report=[];
  const choose=async(client,theme)=>{await evaluate(client==='old'?'OptionsPopup.prototype.setTheme({currentTarget:{value:'+JSON.stringify(theme)+'}});':'PS.prefs.set("theme",'+JSON.stringify(theme)+');');await pause(80);};
  // Hidden WebContentsViews do not route OS pointer input. Dispatch the same
  // bubbling DOM events to exercise delegated handlers in the real renderer.
  const clearHover=async()=>evaluate('window.auditHoverTarget?.dispatchEvent(new MouseEvent("mouseout",{bubbles:true,relatedTarget:document.documentElement}));window.auditHoverTarget=null;');
  const move=async selector=>{
    await clearHover();
    await evaluate('const e=document.querySelector('+JSON.stringify(selector)+');const r=e.getBoundingClientRect();const props={bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2};e.dispatchEvent(new MouseEvent("mouseover",props));e.dispatchEvent(new MouseEvent("mousemove",props));window.auditHoverTarget=e;');
    await pause(450);
  };
  const state=async()=>evaluate(`
    const tip=document.getElementById('showdown-pro-help-tooltip');
    if(!tip)return {visible:false};
    const r=tip.getBoundingClientRect(),s=getComputedStyle(tip);
    return {visible:!tip.hidden,text:tip.textContent,role:tip.getAttribute('role'),color:s.color,background:s.backgroundColor,pointerEvents:s.pointerEvents,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight}};
  `);
  const capture=async name=>{
    const snapshot=await evaluate("const body=document.body.cloneNode(true);body.querySelectorAll('script,iframe').forEach(el=>el.remove());return {className:document.documentElement.className,html:body.outerHTML,css:[...document.styleSheets].map(sheet=>{try{return [...sheet.cssRules].map(r=>r.cssText).join('\\n')}catch{return ''}}).join('\\n')};");
    const preview=new BrowserWindow({width:430,height:750,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
    try{
      const loaded=new Promise(resolve=>preview.webContents.once('dom-ready',resolve));
      preview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html class="'+snapshot.className+'"><head><meta charset="utf-8"><base href="https://play.pokemonshowdown.com/"><style>'+snapshot.css+'</style></head>'+snapshot.html+'</html>')).catch(()=>{});
      await loaded;await pause(100);
      fs.writeFileSync(path.join(out,name+'.png'),(await preview.webContents.capturePage()).toPNG());
    }finally{preview.destroy();}
  };
  for(const client of ['old','new']){
    if(client==='new'){
      await wc.loadURL(newUrl);
      await wait('window.PS?.roomTypes.options&&window.__showdownProTheme&&document.getElementById("showdown-pro-theme")?.sheet');
      await evaluate('PS.send=()=>{};');
    }
    await choose(client,'pro');
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:430,height:750,deviceScaleFactor:1,mobile:false});
    await evaluate(`
      const fixture=document.createElement('div');fixture.id='hover-audit';
      fixture.style.cssText='position:fixed;inset:60px 8px 8px;z-index:2147483000;background:#172f40;color:#e8f1f7;padding:14px;box-sizing:border-box';
      fixture.innerHTML='<span id="existing-description" hidden>Existing description</span><button id="rating" title="Rating: 2290" aria-label="Opponent rating" aria-describedby="existing-description">Opponent rating <span id="rating-child">2290</span></button><p><abbr tabindex="0" id="elo" title="Elo rating">Elo</abbr></p><label style="position:absolute;bottom:8px;right:8px"><input type="checkbox"> <abbr id="spectators" tabindex="0" title="You can still invite spectators by giving them the URL or using the /invite command">Don’t allow spectators</abbr></label><button id="disabled-help" disabled title="This action is unavailable">Unavailable</button><button id="showdex-help" data-showdex-module="Fixture" title="Showdex owns this tip">Showdex</button><div id="tooltipwrapper" style="top:190px;left:0"><div class="tooltipinner"><div class="tooltip"><h2>Pokémon information</h2><p>Ability: Blaze</p></div></div></div>';
      document.body.appendChild(fixture);
    `);
    assert.match(await evaluate('return getComputedStyle(document.querySelector("#tooltipwrapper .tooltip")).backgroundColor;'),/25, 45, 60/,'Pokémon information card keeps Pro styling');
    for(const [id,title] of [['rating','Rating: 2290'],['elo','Elo rating'],['spectators','You can still invite spectators by giving them the URL or using the /invite command'],['disabled-help','This action is unavailable']]){
      await move('#'+id);
      const result=await state();assert.equal(result.visible,true,client+' '+id+' visible');
      assert.equal(result.text,title);assert.equal(result.role,'tooltip');assert.equal(result.pointerEvents,'none');
      assert.match(result.background,/25, 45, 60/);
      assert.ok(result.left>=7&&result.top>=7&&result.right<=431&&result.bottom<=751,client+' '+id+' stays inside portrait viewport');
      assert.equal(await evaluate('return document.querySelector('+JSON.stringify('#'+id)+').getAttribute("title");'),null,'Native tooltip suppressed');
      report.push({client,id,...result});
      if(id==='spectators')await capture(client+'-portrait-help');
      await clearHover();await pause(30);
      assert.equal(await evaluate('return document.querySelector('+JSON.stringify('#'+id)+').getAttribute("title");'),title,'Original title restored');
    }
    await move('#rating-child');assert.equal((await state()).text,'Rating: 2290');
    assert.equal(await evaluate('return document.querySelector("#rating").getAttribute("aria-label");'),'Opponent rating');
    assert.match(await evaluate('return document.querySelector("#rating").getAttribute("aria-describedby");'),/existing-description showdown-pro-help-tooltip/);
    await evaluate('document.querySelector("#rating").setAttribute("title","Rating: 2300");');await pause(30);
    assert.equal((await state()).text,'Rating: 2300','Live title change reflected');
    await evaluate('document.querySelector("#rating").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));');
    assert.equal((await state()).visible,false);
    assert.equal(await evaluate('return document.querySelector("#rating").getAttribute("title");'),'Rating: 2300');
    assert.equal(await evaluate('return document.querySelector("#rating").getAttribute("aria-describedby");'),'existing-description');
    await clearHover();
    await evaluate('document.querySelector("#elo").dispatchEvent(new FocusEvent("focusin",{bubbles:true}));');await pause(200);
    assert.equal((await state()).text,'Elo rating');assert.equal((await state()).visible,true,'Keyboard help shown');
    await evaluate('document.querySelector("#elo").dispatchEvent(new FocusEvent("focusout",{bubbles:true}));');assert.equal((await state()).visible,false,'Keyboard help dismissed');
    await move('#elo');
    await evaluate('document.querySelector("#elo").dispatchEvent(new FocusEvent("focusin",{bubbles:true}));document.querySelector("#elo").dispatchEvent(new FocusEvent("focusout",{bubbles:true}));');
    assert.equal((await state()).visible,false,'Focus after hover dismisses cleanly');
    await move('#elo');await evaluate('document.querySelector("#elo").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));');
    assert.equal((await state()).visible,false,'Click dismisses help');
    await move('#elo');await evaluate('document.querySelector("#hover-audit").dispatchEvent(new Event("scroll"));');
    assert.equal((await state()).visible,false,'Scroll dismisses help');
    await move('#spectators');await choose(client,'light');
    assert.equal((await state()).visible,false,'Theme change dismisses help');
    assert.ok(await evaluate('return document.querySelector("#spectators").hasAttribute("title");'));
    for(const theme of ['light','dark']){
      await choose(client,theme);await move('#elo');
      assert.equal((await state()).visible,false,'Native '+theme+' uses its own help');
      assert.equal(await evaluate('return document.querySelector("#elo").title;'),'Elo rating');
    }
    await choose(client,'pro');await move('#showdex-help');
    assert.equal((await state()).visible,false,'Showdex tooltip handling preserved');
    assert.equal(await evaluate('return document.querySelector("#showdex-help").title;'),'Showdex owns this tip');
    await move('#rating');
    await evaluate('document.querySelector("#rating").remove();');await pause(30);assert.equal((await state()).visible,false,'Removed targets dismiss help');
    await evaluate('document.querySelector("#hover-audit").remove();');
    console.log(client+': rating, ladder, spectator, disabled, keyboard, dynamic title, theme and portrait checks passed.');
  }
  fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
  console.log('Hover help checks passed in both clients.');
};

