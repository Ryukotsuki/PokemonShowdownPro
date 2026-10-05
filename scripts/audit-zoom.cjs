const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({window,client,root,state,waitFor,hubTooltip})=>{
  const panel=window.webContents,wc=client.webContents;
  const clientURL=wc.getURL();
  const wasVisible=window.isVisible(),opacity=window.getOpacity();
  // Native guest-view zoom needs a composited window. Keep the audit silent
  // and transparent, without taking focus from the user's other apps.
  window.setOpacity(0);window.showInactive();
  try {
  wc.setBackgroundThrottling(false);panel.setBackgroundThrottling(false);
  assert.equal(panel.isAudioMuted(),true);assert.equal(wc.isAudioMuted(),true);
  const ui=code=>panel.executeJavaScript('(()=>{'+code+'})()');
  const action=value=>panel.executeJavaScript(`pro.zoom(${JSON.stringify(value)})`);
  const original=state().settings.clientZoomPercent;
  const originalShowdex=state().settings.showdexZoomPercent;
  const originalTheme=state().theme;
  const run=code=>wc.executeJavaScript('(()=>{'+code+'})()');
  const showdexAction=value=>panel.executeJavaScript(`pro.zoom(${JSON.stringify(value)},'showdex')`);
  const waitShowdex=async percent=>{
    await waitFor(()=>state().settings.showdexZoomPercent===percent);
    await waitFor(()=>ui(`return document.getElementById('showdex-zoom-percent').textContent===${JSON.stringify(percent+'%')};`));
    await waitFor(()=>run(`return Math.abs(parseFloat(getComputedStyle(document.querySelector('[data-showdex-module=hellodex]')).zoom)-${percent}/${state().settings.clientZoomPercent})<1e-4;`));
  };
  const waitZoom=async percent=>{
    await waitFor(()=>Math.abs(wc.getZoomFactor()-percent/100)<1e-8&&state().settings.clientZoomPercent===percent);
    await waitFor(()=>ui(`return document.getElementById('zoom-percent').textContent===${JSON.stringify(percent+'%')};`));
    assert.equal(panel.getZoomFactor(),1,'Battle Hub keeps its original size');
    assert.equal(await ui('return document.querySelector(".sidebar").getBoundingClientRect().width;'),state().ui.collapsed?48:360);
  };
  const key=(contents,keyCode)=>{
    const modifiers=[process.platform==='darwin'?'meta':'control'];
    contents.sendInputEvent({type:'keyDown',keyCode,modifiers});contents.sendInputEvent({type:'keyUp',keyCode,modifiers});
  };
  await action('reset');await waitZoom(100);
  await showdexAction('reset');await waitShowdex(100);
  await new Promise(resolve=>setTimeout(resolve,200));
  const metrics=()=>wc.executeJavaScript('({width:innerWidth,ratio:devicePixelRatio,clientWidth:document.documentElement.clientWidth})');
  const size100=await metrics();
  await ui('document.getElementById("zoom-in").click()');await waitZoom(105);
  await ui('document.getElementById("zoom-out").click()');await waitZoom(100);
  key(wc,'=');await waitZoom(105);key(panel,'=');await waitZoom(110);
  await waitFor(async()=>(await metrics()).ratio>size100.ratio);
  key(wc,'-');await waitZoom(105);key(panel,'0');await waitZoom(100);
  await run("if(window.PS)PS.focusRoom('');else app.focusRoom('');");
  wc.focus();wc.sendInputEvent({type:'mouseWheel',x:200,y:200,deltaY:120,modifiers:['control']});
  await waitFor(()=>state().settings.clientZoomPercent!==100);
  await new Promise(resolve=>setTimeout(resolve,200));
  await waitZoom(state().settings.clientZoomPercent);
  await ui('document.getElementById("zoom-reset").click()');await waitZoom(100);
  await panel.executeJavaScript('pro.setSetting("sidebarCollapsed",true)');
  await waitFor(()=>state().ui.collapsed);key(wc,'=');await waitZoom(105);
  await ui('document.getElementById("zoom-in").click()');await waitZoom(110);
  await ui('document.getElementById("zoom-out").click()');await waitZoom(105);
  await ui('document.getElementById("zoom-reset").click()');await waitZoom(100);
  await panel.executeJavaScript('pro.setSetting("sidebarCollapsed",false)');await waitFor(()=>!state().ui.collapsed);
  await assert.rejects(()=>action('anything'),/Invalid zoom action/);
  for(let i=0;i<10;i++)await action('out');await waitZoom(50);
  assert.equal(await ui('return document.getElementById("zoom-out").disabled'),true);
  for(let i=0;i<30;i++)await action('in');await waitZoom(200);
  assert.equal(await ui('return document.getElementById("zoom-in").disabled'),true);
  await action('reset');for(let i=0;i<6;i++)await action('in');await waitZoom(130);
  const directory=require('electron').app.getPath('userData');
  const file=['preferences.json','assistant-preferences.json'].map(name=>path.join(directory,name)).find(name=>fs.existsSync(name));
  assert.ok(file,'Saved preference file exists');
  assert.equal(require('../app/preferences.cjs').loadPreferences(file).clientZoomPercent,130);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Zoom reload timed out')),45000);
    wc.once('did-finish-load',()=>{clearTimeout(timer);resolve();});wc.reload();
  });
  await waitZoom(130);
  await waitFor(()=>run('return !!document.querySelector("[data-showdex-module=hellodex]");'));
  const independent=async()=>{
    return run('const root=document.querySelector("[data-showdex-module=hellodex]");let probe=root.querySelector("#zoom-audit-probe");if(!probe){probe=document.createElement("span");probe.id="zoom-audit-probe";probe.style.cssText="position:absolute;left:0;top:0;width:100px;height:10px;pointer-events:none";root.append(probe);}const r=root.getBoundingClientRect(),p=root.closest(".ps-room").getBoundingClientRect();return {size:probe.getBoundingClientRect().width*devicePixelRatio,rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},parent:{x:p.x,y:p.y,right:p.right,bottom:p.bottom}};');
  };
  await run("if(window.PS)PS.focusRoom('hellodex');else app.focusRoom('view-hellodex');");
  const baseline=await independent();
  await ui('document.getElementById("showdex-zoom-in").click()');await waitShowdex(105);
  await waitFor(async()=>Math.abs((await independent()).size/baseline.size-1.05)<.01);
  await action('out');await waitZoom(125);await waitShowdex(105);
  await waitFor(async()=>Math.abs((await independent()).size/baseline.size-1.05)<.01);
  await ui('document.getElementById("showdex-zoom-out").click()');await waitShowdex(100);
  await ui('document.getElementById("showdex-zoom-reset").click()');await waitShowdex(100);
  for(let i=0;i<6;i++)await showdexAction('in');await waitShowdex(130);
  await action('in');await waitZoom(130);
  assert.equal(require('../app/preferences.cjs').loadPreferences(file).showdexZoomPercent,130);
  await assert.rejects(()=>panel.executeJavaScript("pro.zoom('in','anything')"),/Invalid zoom target/);
  for(const [showdown,showdex] of [[50,200],[200,50],[100,150]]) {
    while(state().settings.clientZoomPercent!==showdown)await action(state().settings.clientZoomPercent<showdown?'in':'out');
    while(state().settings.showdexZoomPercent!==showdex)await showdexAction(state().settings.showdexZoomPercent<showdex?'in':'out');
    await waitZoom(showdown);await waitShowdex(showdex);
    await new Promise(resolve=>setTimeout(resolve,300));
    await run("if(window.PS)PS.focusRoom('hellodex');else app.focusRoom('view-hellodex');");
    await new Promise(resolve=>setTimeout(resolve,200));
    const sizing=await independent();
    assert.ok(sizing.rect.width>0&&sizing.rect.height>0&&sizing.rect.x>=sizing.parent.x-.5&&sizing.rect.y>=sizing.parent.y-.5&&sizing.rect.right<=sizing.parent.right+.5&&sizing.rect.bottom<=sizing.parent.bottom+.5,'Showdex fits its Showdown room at independent zoom levels '+JSON.stringify({showdown,showdex,...sizing}));
  }
  await action('reset');for(let i=0;i<6;i++)await action('in');await waitZoom(130);
  await showdexAction('reset');for(let i=0;i<10;i++)await showdexAction('in');await waitShowdex(150);
  await new Promise(resolve=>setTimeout(resolve,250));
  wc.focus();
  await run('const b=[...document.querySelectorAll("[data-showdex-module=hellodex] button")].find(b=>b.checkVisibility());b.focus();');
  await new Promise(resolve=>setTimeout(resolve,100));
  key(wc,'=');await waitShowdex(155);await waitZoom(130);
  await showdexAction('reset');for(let i=0;i<10;i++)await showdexAction('in');await waitShowdex(150);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Independent zoom reload timed out')),45000);
    // Keep the selected client route; classic room navigation can change it.
    wc.once('did-finish-load',()=>{clearTimeout(timer);resolve();});void wc.loadURL(clientURL).catch(reject);
  });
  await waitFor(()=>run('return !!document.querySelector("[data-showdex-module=hellodex]");'));
  await waitZoom(130);await waitShowdex(150);
  const out=path.join(root,'test-results/zoom');fs.mkdirSync(out,{recursive:true});
  for(const theme of ['pro','light','dark']) {
    await ui(`document.documentElement.dataset.theme=${JSON.stringify(theme)};`);
    const fit=await ui('const group=document.querySelector(".zoom-controls").getBoundingClientRect(),sidebar=document.querySelector(".sidebar").getBoundingClientRect();return group.left>=sidebar.left&&group.right<=sidebar.right;');
    assert.equal(fit,true,'Zoom toolbar fits '+theme);
    fs.writeFileSync(path.join(out,theme+'.png'),(await panel.capturePage({x:window.getContentSize()[0]-360,y:0,width:360,height:230})).toPNG());
    await panel.executeJavaScript('pro.setSetting("sidebarCollapsed",true)');
    await waitFor(()=>ui('return document.body.dataset.collapsed==="true";'));
    await ui(`document.documentElement.dataset.theme=${JSON.stringify(theme)};`);
    const rail=await ui('const sidebar=document.querySelector(".sidebar").getBoundingClientRect();return [...document.querySelectorAll(".hub-controls button:not([hidden]), #collapsed-status")].filter(button=>button.checkVisibility()).map(button=>{const rect=button.getBoundingClientRect();return {id:button.id,visible:rect.width>0&&rect.height>0,fits:rect.left>=sidebar.left&&rect.right<=sidebar.right&&rect.bottom<=sidebar.bottom,clickable:button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)),textFits:button.scrollWidth<=button.clientWidth};});');
    for(const id of ['zoom-out','zoom-reset','zoom-in','showdex-zoom-out','showdex-zoom-reset','showdex-zoom-in']) assert.ok(rail.some(button=>button.id===id),'Collapsed rail contains '+id);
    for(const button of rail) assert.deepEqual(button,{id:button.id,visible:true,fits:true,clickable:true,textFits:true},'Collapsed control fits and can be clicked: '+button.id+' / '+theme);
    await ui('document.getElementById("showdex-zoom-in").click()');await waitShowdex(155);
    await ui('document.getElementById("showdex-zoom-out").click()');await waitShowdex(150);
    fs.writeFileSync(path.join(out,theme+'-collapsed.png'),(await panel.capturePage({x:window.getContentSize()[0]-48,y:0,width:48,height:450})).toPNG());
    await panel.executeJavaScript('pro.setSetting("sidebarCollapsed",false)');
    await waitFor(()=>ui('return document.body.dataset.collapsed==="false";'));
    assert.equal(await ui('return document.querySelectorAll(".hero .zoom-controls").length;'),2,'Both toolbars return to the expanded Hub');
  }
  await action('reset');while(state().settings.clientZoomPercent!==original)await action(state().settings.clientZoomPercent<original?'in':'out');
  await waitZoom(original);
  await showdexAction('reset');while(state().settings.showdexZoomPercent!==originalShowdex)await showdexAction(state().settings.showdexZoomPercent<originalShowdex?'in':'out');
  await waitShowdex(originalShowdex);
  if(hubTooltip) {
    const labels={
      'zoom-out':'Zoom Showdown out','zoom-in':'Zoom Showdown in','zoom-reset':'Reset Showdown zoom to 100%',
      'showdex-zoom-out':'Zoom Showdex out','showdex-zoom-in':'Zoom Showdex in','showdex-zoom-reset':'Reset Showdex zoom to 100%',
    };
    const tip=hubTooltip.view,tipContents=tip.webContents;
    assert.equal(tipContents.isAudioMuted(),true);
    const setTheme=async value=>{
      await run(`if(window.PS)PS.prefs.set('theme',${JSON.stringify(value)});else OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(value)}}});`);
      await waitFor(()=>state().theme===value);
    };
    for(const theme of ['pro','light','dark']) {
      await setTheme(theme);
      for(const collapsed of [false,true]) {
        await panel.executeJavaScript(`pro.setSetting('sidebarCollapsed',${collapsed})`);
        await waitFor(()=>ui(`return document.body.dataset.collapsed===${JSON.stringify(String(collapsed))};`));
        await ui('document.activeElement.blur();');
        for(const [id,label] of Object.entries(labels)) {
          assert.equal(await ui(`return document.getElementById(${JSON.stringify(id)}).hasAttribute('title');`),false,'No native zoom tooltip');
          const point=await ui(`const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};`);
          panel.sendInputEvent({type:'mouseMove',...point});
          await waitFor(async()=>tip.getVisible()&&await tipContents.executeJavaScript(`document.getElementById('label').textContent===${JSON.stringify(label)}&&document.documentElement.dataset.theme===${JSON.stringify(theme)}`));
          const bounds=tip.getBounds(),[width,height]=window.getContentSize();
          assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width-(collapsed?48:360)&&bounds.y+bounds.height<=height,'Zoom tooltip fits and leaves the controls clear');
          assert.equal(await tipContents.executeJavaScript('getComputedStyle(document.getElementById("label")).borderRadius'),'6px');
          panel.sendInputEvent({type:'mouseMove',x:5,y:400});
          await waitFor(()=>!tip.getVisible());
        }
      }
    }
    await panel.executeJavaScript("pro.setSetting('sidebarCollapsed',false)");
    await setTheme(originalTheme);
    console.log('All six zoom hover labels passed: styled overlay, three themes, expanded and collapsed Hub, no native titles, no clipping or blocked controls.');
  }
  console.log('Independent zoom passed: Showdown and Showdex scaling, toolbars, collapsed controls, shortcuts, Ctrl+wheel, limits, saved preferences, reload and fixed Hub size.');
  } finally {if(!wasVisible)window.hide();window.setOpacity(opacity);}
};
