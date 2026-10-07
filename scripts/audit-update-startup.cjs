// Exercise the real app startup, with no internet, accounts, or audible windows.
require('./mute-test-audio.cjs');
const {app,BrowserWindow,webContents}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {defaults}=require('../app/preferences.cjs');
app.disableHardwareAcceleration();
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pro-update-startup-'));
app.setPath('userData',profile);
const preferences={...defaults,showdexEnabled:false,autoUpdateAddons:false,autoUpdateApp:false,foulPlayEnabled:false,
 addons:Object.fromEntries(Object.keys(defaults.addons).map(key=>[key,false]))};
for(const name of ['preferences.json','assistant-preferences.json'])fs.writeFileSync(path.join(profile,name),JSON.stringify(preferences));
const stage=path.join(profile,'app-update-staging/update-audit'),token=require('node:crypto').randomBytes(16).toString('hex');
fs.mkdirSync(stage,{recursive:true});
fs.writeFileSync(path.join(stage,'job.json'),JSON.stringify({token,execPath:process.execPath,version:app.getVersion()}));
process.argv.push('--pro-update-confirm='+token);
BrowserWindow.prototype.show=function(){};
let onlineRequested=false;
app.on('web-contents-created',(_event,contents)=>{
 const loadURL=contents.loadURL.bind(contents);
 contents.loadURL=(url,...args)=>{
  if(url.startsWith('https://play.pokemonshowdown.com/')) {
   onlineRequested=true;
   // A stalled connection must never prevent the local app from confirming.
   return new Promise(()=>{});
  }
  return loadURL(url,...args);
 };
});
const deadline=setTimeout(()=>{console.error('Update startup did not confirm while Showdown was stalled');app.exit(1);},30000);
// Require synchronously: the app registers its scheme before Electron is ready.
require('../app/main.cjs');
app.whenReady().then(async()=>{
 const marker=path.join(stage,'confirmed');
 while(!onlineRequested || !fs.existsSync(marker))await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(fs.readFileSync(marker,'utf8'),token);
 const window=BrowserWindow.getAllWindows()[0];
 assert.ok(window);
 const state=await window.webContents.executeJavaScript('window.pro.getState()');
 assert.equal(state.appVersion,app.getVersion());
 assert.equal(await window.webContents.executeJavaScript('!!document.getElementById("app-updates-title")'),true);
 assert.ok(webContents.getAllWebContents().every(contents=>contents.isAudioMuted()));
 clearTimeout(deadline);
 // Close normally while the online load is still unresolved. Confirmation
 // must already be persisted for the detached installer to accept this exit.
 app.once('before-quit',()=>{
  try {
   assert.equal(fs.readFileSync(marker,'utf8'),token);
   console.log('Update startup: local Battle Hub confirmed with Showdown stalled; normal close kept confirmation.');
  }catch(error){console.error(error);app.exit(1);}
 });
 app.once('will-quit',event=>{
  event.preventDefault();
  // Chromium may still hold cache files. Bound cleanup of this isolated audit
  // profile so a busy temporary directory cannot fail the startup assertions.
  assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));
  let cleanupTimer;
  Promise.race([
   fs.promises.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100}),
   new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>reject(Object.assign(new Error('Busy audit profile'),{code:'EBUSY'})),3000);}),
  ]).catch(error=>{
   if(!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code))throw error;
  }).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);}).finally(()=>clearTimeout(cleanupTimer));
 });
 window.close();
}).catch(error=>{console.error(error);app.exit(1);});
