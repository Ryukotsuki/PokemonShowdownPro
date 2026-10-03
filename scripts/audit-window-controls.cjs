const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({window,client,root,state,waitFor})=>{
  const panel=window.webContents,wc=client.webContents;
  const ui=code=>panel.executeJavaScript('(()=>{'+code+'})()');
  assert.equal(panel.isAudioMuted(),true);assert.equal(wc.isAudioMuted(),true);
  assert.equal(require('electron').Menu.getApplicationMenu(),null);
  if(process.platform!=='darwin')assert.equal(window.isMenuBarVisible(),false);
  const click=()=>ui('document.getElementById("fullscreen-toggle").click();');
  const waitMode=async value=>{
    await waitFor(()=>window.isFullScreen()===value&&state().ui.fullscreen===value);
    await waitFor(()=>ui(`return document.getElementById('fullscreen-toggle').getAttribute('aria-pressed')===${JSON.stringify(String(value))};`));
    assert.equal(await ui('return document.getElementById("fullscreen-toggle").getAttribute("aria-label");'),value?'Exit fullscreen':'Enter fullscreen');
  };
  const key=contents=>{contents.sendInputEvent({type:'keyDown',keyCode:'F11'});contents.sendInputEvent({type:'keyUp',keyCode:'F11'});};
  await click();await waitMode(true);
  key(wc);await waitMode(false);
  key(panel);await waitMode(true);
  await click();await waitMode(false);
  await panel.executeJavaScript('pro.setSetting("sidebarCollapsed",true)');
  await waitFor(()=>state().ui.collapsed);
  assert.equal(await ui('const r=document.getElementById("fullscreen-toggle").getBoundingClientRect(),s=document.querySelector(".sidebar").getBoundingClientRect();return r.width>0&&r.left>=s.left&&r.right<=s.right;'),true);
  await click();await waitMode(true);await click();await waitMode(false);
  await panel.executeJavaScript('pro.setSetting("sidebarCollapsed",false)');
  await waitFor(()=>!state().ui.collapsed);
  const out=path.join(root,'test-results/window-controls');fs.mkdirSync(out,{recursive:true});
  for(const theme of ['pro','light','dark']) {
    await ui(`document.documentElement.dataset.theme=${JSON.stringify(theme)};`);
    const layout=await ui('const controls=document.querySelector(".hub-controls").getBoundingClientRect(),text=document.querySelector(".brand>div").getBoundingClientRect();return {overlap:controls.left<text.right&&controls.right>text.left&&controls.top<text.bottom&&controls.bottom>text.top,overflow:document.querySelector(".sidebar").scrollWidth>360};');
    assert.equal(layout.overlap,false,'Hub controls do not cover branding');assert.equal(layout.overflow,false);
    fs.writeFileSync(path.join(out,theme+'.png'),(await panel.capturePage()).toPNG());
    if(theme==='pro')fs.writeFileSync(path.join(out,'header.png'),(await panel.capturePage({x:window.getContentSize()[0]-360,y:0,width:360,height:112})).toPNG());
  }
  if(await ui('return !!document.getElementById("pause-auto");')) {
    await ui('document.getElementById("pause-auto").hidden=false;');
    assert.equal(await ui('const controls=document.querySelector(".hub-controls").getBoundingClientRect(),brand=document.querySelector(".brand").getBoundingClientRect();return controls.bottom<=brand.top;'),true,'Private pause and fullscreen controls leave the branding clear');
    await ui('document.getElementById("pause-auto").hidden=true;');
  }
  console.log('Window controls passed: no menu, fullscreen IPC/button, F11 in both views, collapsed rail, three themes and muted audio.');
};
