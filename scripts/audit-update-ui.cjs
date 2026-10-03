const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async({window,client,root})=>{
 const wc=window.webContents,run=code=>wc.executeJavaScript('(()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<100;i++){if(await run('return !!('+code+');'))return;await pause(50);}throw new Error('Update controls timed out: '+code);};
 const initial=await wc.executeJavaScript('pro.getState()');
 assert.equal(wc.isAudioMuted(),true);assert.equal(client.webContents.isAudioMuted(),true);
 await wc.executeJavaScript("pro.setSetting('sidebarTab','addons')");
 assert.equal(initial.appUpdates.supported,false,'Audit sessions must not use a live app update feed');
 await wc.executeJavaScript("pro.setSetting('autoUpdateApp',false)");
 assert.equal((await wc.executeJavaScript('pro.getState()')).settings.autoUpdateApp,false);
 const auditUpdate=await wc.executeJavaScript('pro.checkAppUpdates()');
 assert.equal(auditUpdate.appUpdates.status,'idle');
 await wc.executeJavaScript("pro.setSetting('autoUpdateAddons',false)");
 assert.equal((await wc.executeJavaScript('pro.getState()')).settings.autoUpdateAddons,false);
 wc.reload();await wait('window.pro&&document.getElementById("check-addon-updates")&&document.getElementById("auto-update-addons").checked===false');
 await wait('document.getElementById("auto-update-app").checked===false&&document.getElementById("check-app-updates").disabled');
 assert.equal(await run('return document.getElementById("app-update-action").hidden;'),true);
 await run('document.getElementById("check-addon-updates").click();');
 await wait('document.getElementById("addon-update-status").textContent.includes("up to date")');
 assert.ok((await wc.executeJavaScript('pro.getState()')).addonUpdates.lastCheckedAt>0);
 await wc.executeJavaScript("pro.setSetting('autoUpdateAddons',true)");
 assert.equal(await run('return document.getElementById("auto-update-addons").checked;'),true);
 const out=path.join(root,'test-results/update-ui');fs.mkdirSync(out,{recursive:true});
 for(const theme of ['pro','light','dark']) {
  await client.webContents.executeJavaScript(`window.PS?.prefs?PS.prefs.set('theme',${JSON.stringify(theme)}):OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(theme)}}});`);await pause(150);
  await run('document.getElementById("updates-title").scrollIntoView({block:"start"});');
  const bounds=await run('const section=document.getElementById("updates-title").closest("section"),button=document.getElementById("check-addon-updates"),r=section.getBoundingClientRect(),b=button.getBoundingClientRect();return {overflow:section.scrollWidth>section.clientWidth+1,buttonInside:b.left>=r.left&&b.right<=r.right};');
  assert.equal(bounds.overflow,false);assert.equal(bounds.buttonInside,true);
  await run('document.getElementById("app-updates-title").scrollIntoView({block:"start"});');
  const appBounds=await run('const section=document.getElementById("app-updates-title").closest("section"),r=section.getBoundingClientRect(),b=document.getElementById("check-app-updates").getBoundingClientRect();return {overflow:section.scrollWidth>section.clientWidth+1,buttonInside:b.left>=r.left&&b.right<=r.right};');
  assert.equal(appBounds.overflow,false);assert.equal(appBounds.buttonInside,true);
  const [width,height]=window.getContentSize();fs.writeFileSync(path.join(out,theme+'.png'),(await wc.capturePage({x:width-360,y:0,width:360,height})).toPNG());
 }
 await wc.executeJavaScript(`pro.setSetting('autoUpdateAddons',${initial.settings.autoUpdateAddons!==false})`);
 await wc.executeJavaScript(`pro.setSetting('autoUpdateApp',${initial.settings.autoUpdateApp!==false})`);
 await wc.executeJavaScript("pro.setSetting('sidebarTab','battle')");
 console.log('Update controls passed: real IPC, automatic-update preference, panel reload, manual check, muted views and three palettes.');
};
