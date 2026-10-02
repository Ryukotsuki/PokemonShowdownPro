const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {BrowserWindow}=require('electron');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async(wc,root)=>{
  const out=path.join(root,'test-results/formats-theme');fs.mkdirSync(out,{recursive:true});
  wc.setBackgroundThrottling(false);
  const evaluate=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
  const wait=async code=>{for(let n=0;n<160;n++){if(await evaluate('return !!('+code+');').catch(()=>false))return;await pause(250);}throw new Error('Format audit timed out: '+code);};
  wc.debugger.attach('1.3');await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');
  await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}});app.addPopup(OptionsPopup);");
  const url=await evaluate('return document.querySelector(\'.ps-popup a[href="/newclient"]\').href;');
  await evaluate('app.closePopup();app.socket.send=()=>{};');
  const selector='.ps-popup:has(> span[name="formats"]),#room-formatdropdown';
  const font=fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style/font-awesome.css'),'utf8')+'\n@font-face{font-family:FontAwesome;src:url(data:font/woff2;base64,'+fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style/fonts/fontawesome-webfont.woff2')).toString('base64')+') format("woff2");font-weight:normal;font-style:normal}';
  const report=[];
  const capture=async name=>{
    const data=await evaluate("const body=document.body.cloneNode(true);body.querySelectorAll('script,iframe').forEach(el=>el.remove());return {className:document.documentElement.className,body:body.outerHTML,css:[...document.styleSheets].map(sheet=>{try{return [...sheet.cssRules].map(r=>r.cssText).join('\\n')}catch{return ''}}).join('\\n'),width:innerWidth,height:innerHeight};");
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data));
    const win=new BrowserWindow({width:data.width,height:data.height,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
    try{
      const loaded=new Promise(resolve=>win.webContents.once('dom-ready',resolve));
      win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html class="'+data.className+'"><head><base href="https://play.pokemonshowdown.com/"><style>'+data.css+font+'</style></head>'+data.body+'</html>')).catch(()=>{});
      await loaded;await pause(150);fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
    }finally{win.destroy();}
  };
  for(const client of ['old','new']){
    if(client==='new'){
      await wc.loadURL(url);await wait('window.PS?.roomTypes.options&&window.__showdownProTheme&&document.getElementById("showdown-pro-theme")?.sheet');
      await evaluate('PS.prefs.set("theme","pro");PS.send=()=>{};');
    }
    await wait('Object.keys(window.BattleFormats||{}).length>50');
    await evaluate(client==='old'?'app.closePopup();document.querySelector(".menugroup button[name=format]").click();':'PS.closePopupsAbove(null);PS.focusRoom("");PS.update();');
    if(client==='new'){await pause(200);await evaluate('document.querySelector("button[name=format]").click();');}
    await wait('document.querySelector('+JSON.stringify(selector)+')?.querySelector("button.option")');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('button.option:not(.cur)').id='audit-format-choice';`);
    const {root:dom}=await wc.debugger.sendCommand('DOM.getDocument');
    const {nodeId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:dom.nodeId,selector:'#audit-format-choice'});
    for(const [state,color] of [['hover','rgb(40, 81, 107)'],['active','rgb(52, 103, 131)']]){
      await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[state]});
      assert.equal(await evaluate('return getComputedStyle(document.querySelector("#audit-format-choice")).backgroundColor;'),color,state+' styling');
    }
    await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['focus-visible']});
    assert.equal(await evaluate('return getComputedStyle(document.querySelector("#audit-format-choice")).outlineWidth;'),'2px');
    await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
    for(const width of [1200,780,430]){
      await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});await pause(150);
      const layout=await evaluate(`
        const p=document.querySelector(${JSON.stringify(selector)}),r=p.getBoundingClientRect();
        const b=p.querySelector('button.option'),s=getComputedStyle(b),star=b.querySelector('i'),sr=star.getBoundingClientRect();
        const cards=p.querySelectorAll('span[name=formats]>.popupmenu,.options-column,.options');
        return {left:r.left,right:r.right,bottom:r.bottom,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,fontSize:s.fontSize,rowHeight:b.getBoundingClientRect().height,starColor:getComputedStyle(star).color,starLeft:sr.left,buttonRight:b.getBoundingClientRect().right,cards:[...cards].map(c=>({width:c.getBoundingClientRect().width,scroll:c.scrollWidth})),columns:getComputedStyle(p.querySelector('span[name=formats],.pad')).gridTemplateColumns};
      `);
      assert.ok(layout.left>=7&&layout.right<=width-7&&layout.bottom<=851,'Popup stays in viewport');
      assert.ok(layout.scrollWidth<=layout.clientWidth+1,'No horizontal scrolling');
      assert.equal(layout.fontSize,'13px');assert.ok(layout.rowHeight>=27);
      assert.ok(layout.starLeft<layout.buttonRight,'Stars remain within their row');
      if(layout.cards.some(c=>c.scroll>c.width+1)){console.log(client,width,layout);await capture(client+'-overflow');}
      for(const c of layout.cards)assert.ok(c.scroll<=c.width+1,'Category content stays within card');
      if(width===430)assert.equal(layout.columns.split(' ').length,1,'Portrait has one column');
      report.push({client,width,...layout});await capture(client+'-'+width);
    }
    await evaluate(`const p=document.querySelector(${JSON.stringify(selector)}),i=p.querySelector('input[name=search]');i.value='monotype';i.dispatchEvent(new Event(${JSON.stringify(client==='old'?'keyup':'input')},{bubbles:true}));`);await pause(150);
    // The new client keeps favorites pinned while filtering ordinary rows.
    assert.ok(await evaluate(`const rows=[...document.querySelector(${JSON.stringify(selector)}).querySelectorAll('button.option')].filter(b=>!b.querySelector('i.star.cur'));return rows.length>0&&rows.every(b=>b.textContent.toLowerCase().includes('monotype'));`),'Search works');
    await capture(client+'-search');
    await evaluate(`const i=document.querySelector(${JSON.stringify(selector)}).querySelector('input[name=search]');i.value='';i.dispatchEvent(new Event(${JSON.stringify(client==='old'?'keyup':'input')},{bubbles:true}));`);await pause(100);
    const favorite=await evaluate(`const b=document.querySelector(${JSON.stringify(selector)}).querySelector('button.option:has(i.subtle),button.option:has(i.fa-star-o)');window.auditFavoriteValue=b.value;b.querySelector('i').click();return b.value;`);await pause(100);
    assert.ok(await evaluate(client==='old'?'return Object.values(Storage.prefs("starredformats")).some(Boolean);':'return Object.values(PS.prefs.starredformats).some(Boolean);'),'Favorite toggles');
    const starredColor=await evaluate(`return getComputedStyle(document.querySelector(${JSON.stringify(selector)}).querySelector('i.fa-star:not(.subtle)')).color;`);
    assert.equal(starredColor,'rgb(255, 214, 117)');
    await evaluate(`const p=document.querySelector(${JSON.stringify(selector)});const s=p.querySelector('details[open] summary');if(s){const d=s.parentElement;const was=d.open;s.click();if(d.open===was)throw new Error('Category did not collapse');s.click();}`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('button.option').click();`);await pause(100);
    assert.equal(await evaluate('return !!document.querySelector('+JSON.stringify(selector)+');'),false,'Selection closes the menu');
    console.log(client+': desktop, portrait, search, favorite, collapse and selection passed ('+favorite+').');
  }
  fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
};
