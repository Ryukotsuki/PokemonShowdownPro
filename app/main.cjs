const { app, BrowserWindow, WebContentsView, ipcMain, protocol, session, net, shell, Menu, clipboard, nativeImage, screen } = require('electron');
require('./linux-integration.cjs').configureLinuxRuntime(app);
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Battles } = require('./battles.cjs');
const {fetchReplayOutcome}=require('./replay-outcomes.cjs');
const { defaults, replayUrl, validMessages, sidebarTabs, shouldUploadReplay, loadPreferences, savePreferences, addReplay } = require('./preferences.cjs');
const { addons: addonCatalog } = require('./addon-catalog.cjs');
const { BrowserAddons } = require('./browser-addons.cjs');
const { AddonUpdates } = require('./addon-updates.cjs');
const { AppUpdates } = require('./app-updates.cjs');
const { prepareUpdates } = require('./update-process.cjs');
const { BattleMessages } = require('./battle-messages.cjs');
const { createHubTooltip } = require('./hub-tooltip.cjs');
const { emptyRecord, loadRecord, saveRecord, recordBattle } = require('./win-loss.cjs');
const root = path.resolve(__dirname, '..');
const appVersion = app.getVersion();
const appTitle = 'Pokémon Showdown Pro';
const appIcon = path.join(__dirname, 'assets/icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const APP_ID = 'com.pokemonshowdownpro.desktop';
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
function setProgramIdentity(win) {
  if (process.platform !== 'win32') return;
  win.setAppDetails({
    appId: APP_ID,
    appIconPath: appIcon,
    appIconIndex: 0,
    relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${root}"`,
    relaunchDisplayName: 'Pokémon Showdown Pro',
  });
  win.setIcon(appIcon);
}
const CLIENT_URL = 'https://play.pokemonshowdown.com/';
const SIDEBAR_WIDTH = 360;
const smoke = process.argv.includes('--smoke-test');
const verifyRelease = process.argv.includes('--verify-release');
if (smoke || verifyRelease) require('../scripts/mute-test-audio.cjs');
if (smoke) app.setPath('userData', process.env.SHOWDOWN_PRO_SMOKE_PROFILE || path.join(root, 'test-results/smoke-profile'));
if (verifyRelease) app.setPath('userData', process.env.SHOWDOWN_PRO_VERIFY_PROFILE || path.join(require('node:os').tmpdir(),'showdown-pro-release-check'));
protocol.registerSchemesAsPrivileged([{ scheme: 'showdown-pro', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let window, client, hubTooltip, closing = false;
let browserAddons, appliedShowdex = true, reloadJob = null;
let addonUpdates, updateTimer, appUpdates, appUpdateTimer;
const rolledBackUpdates=new Set();
const updatesIdle=()=>!closing&&![...battles.rooms.values()].some(room=>!room.ended);
function checkAutoUpdates() {if(closing||smoke||!preferences.autoUpdateAddons&&!addonUpdates?.manualDeferred)return;if(!updatesIdle()){addonUpdates?.cancel();return;}void addonUpdates?.check(addonUpdates.manualDeferred).catch(error=>console.error('Update check:',error.message));}
const addonWindows = new Set();
let clientSession;
let messageStatus=null;
const battleMessages=new BattleMessages({send:payload=>client.webContents.executeJavaScript(`window.__showdownPro?.sendBattleMessage(${JSON.stringify(payload)})`),onStatus:status=>{messageStatus=status;publish();}});
let showdexStatus = 'Loading…', clientStatus = 'Connecting…', theme = 'pro';
let postMatchStatus = null, postMatchRoomId = null, postMatchStatusVersion = 0;
let statisticsError = null, lifetimeRecord = { allTime: emptyRecord(), countedBattleIds: [] }, statisticsFile;
const sessionRecord = emptyRecord();
const battles = new Battles();
let navigationVersion = 0;
let replayUploadJob = Promise.resolve();
const replayClaims = new Set();
let preferences = { ...defaults, recentReplays: [] }, preferencesFile;
let replayOutcomeJob=null;
const replayOutcomeAttempts=new Set(),replayOutcomePending=new Set();
async function refreshReplayOutcomes() {
  if(smoke || replayOutcomeJob || !client || client.webContents.isDestroyed() || closing)return;
  replayOutcomeJob=(async()=>{
    const player=await client.webContents.executeJavaScript('window.__showdownPro?.playerId()').catch(()=>null);
    if(!player)return;
    const missing=preferences.recentReplays.filter(replay=>!['win','loss','tie'].includes(replay.outcome) && !replayOutcomeAttempts.has(player+'|'+replay.url));
    for(const replay of missing) {replayOutcomeAttempts.add(player+'|'+replay.url);replayOutcomePending.add(replay.url);}
    publish();let index=0;
    const worker=async()=>{
      while(index<missing.length && !closing) {
        const replay=missing[index++],outcome=await fetchReplayOutcome(replay.url,player);
        const current=preferences.recentReplays.find(item=>item.url===replay.url);
        if(outcome && current && !['win','loss','tie'].includes(current.outcome)) {
          current.outcome=outcome;
          try {savePreferences(preferencesFile,preferences);}catch {delete current.outcome;}
        }
        replayOutcomePending.delete(replay.url);publish();
      }
    };
    await Promise.all([worker(),worker()]);
  })().finally(()=>{replayOutcomePending.clear();replayOutcomeJob=null;publish();});
  await replayOutcomeJob;
}
function state() {
  return { appVersion, theme, showdexStatus, clientStatus, postMatchStatus, messageStatus, recentReplays:preferences.recentReplays, replayOutcomePending:[...replayOutcomePending], ui:{collapsed:preferences.sidebarCollapsed,tab:preferences.sidebarTab,fullscreen:!!window?.isFullScreen()}, appUpdates:appUpdates?.snapshot(), addonUpdates:addonUpdates?.snapshot(), addons:browserAddons?.snapshot(preferences.addons)||[], reloadPending:preferences.showdexEnabled!==appliedShowdex || !!browserAddons?.pending(preferences.addons), statisticsError, statistics: { allTime: lifetimeRecord.allTime, session: sessionRecord }, settings:{...preferences}, rooms: [...battles.rooms.values()].reverse().filter(room => !room.ended).map(room => ({
    id: room.id, title: room.title || room.id, turn: room.turn, status: room.status,
  })) };
}
function publish() { if (window && !window.isDestroyed()) window.webContents.send('panel:update', state()); }
function layout() {
  if(!window || !client) return;
  hubTooltip?.hide();
  const [width,height]=window.getContentSize();
  client.setBounds({x:0,y:0,width:width-(preferences.sidebarCollapsed ? 48 : SIDEBAR_WIDTH),height});
}
function finishedStatus(room, message, version) {
  room.status = message;
  if (postMatchStatusVersion === version) { postMatchRoomId = room.id; postMatchStatus = `${room.title || room.id}: ${message}`; }
  publish();
}
function setSetting(key, value) {
  if(typeof key!=='string')throw new Error('Invalid setting.');
  if(key==='showdexEnabled' || typeof key==='string' && key.startsWith('addon:')) {
    const addon=key.startsWith('addon:') ? key.slice(6) : null;
    if(typeof value!=='boolean' || key.startsWith('addon:') && !addonCatalog.some(item=>item.key===addon)) throw new Error('Invalid system setting.');
    const previous=addon ? preferences.addons[addon] : preferences[key];
    if(addon)preferences.addons[addon]=value;else preferences[key]=value;
    try {savePreferences(preferencesFile,preferences);}catch(error){if(addon)preferences.addons[addon]=previous;else preferences[key]=previous;throw error;}
    publish();return state();
  }
  if(['sidebarCollapsed','sidebarTab','messages'].includes(key)) {
    if(key==='sidebarCollapsed' && typeof value!=='boolean' || key==='sidebarTab' && !sidebarTabs.includes(value) || key==='messages' && !validMessages(value)) throw new Error(key==='messages' ? 'Enabled messages need 1–280 characters of plain text, without commands or line breaks.' : 'Invalid sidebar setting.');
    const previous=preferences[key];
    preferences[key]=key==='messages' ? {...value} : value;
    try {savePreferences(preferencesFile,preferences);} catch(error) {preferences[key]=previous;throw error;}
    if(key==='sidebarCollapsed') layout();
    if(key==='sidebarTab' && value==='history')void refreshReplayOutcomes();
    publish();return state();
  }
  if (!['autoStartTimer', 'saveWinningReplays', 'saveLosingReplays', 'autoUpdateAddons', 'autoUpdateApp'].includes(key) || typeof value !== 'boolean') throw new Error('Invalid setting.');
  const previous = preferences[key];
  preferences[key] = value;
  try { savePreferences(preferencesFile, preferences); } catch (error) { preferences[key] = previous; throw error; }
  if(key==='autoUpdateApp' && value)void appUpdates?.check();
  if(key==='autoUpdateAddons'){if(value)checkAutoUpdates();else addonUpdates?.cancel();}
  if (key === 'autoStartTimer' && client && !client.webContents.isDestroyed()) {
    void client.webContents.executeJavaScript(`window.__showdownPro?.setAutoTimer(${value})`).catch(() => {});
  }
  publish(); return state();
}
function processFinished(room) {
  if (closing || !['win', 'tie'].includes(room.finishReason) || !room.playerSide || !shouldUploadReplay(preferences, room.outcome) || replayClaims.has(room.id)) return;
  replayClaims.add(room.id);
  if (replayClaims.size > 400) replayClaims.delete(replayClaims.values().next().value);
  const version = navigationVersion;
  replayUploadJob = replayUploadJob.then(async () => {
    if (closing || version !== navigationVersion || !shouldUploadReplay(preferences, room.outcome)) return;
    const statusVersion = ++postMatchStatusVersion;
    finishedStatus(room, 'Uploading replay…', statusVersion);
    try {
      const uploaded = await client.webContents.executeJavaScript(`window.__showdownPro?.saveReplay(${JSON.stringify(room.id)})`);
      if (closing || version !== navigationVersion) return;
      if (!uploaded?.url || !replayUrl(uploaded.url)) throw new Error(uploaded?.error || 'No confirmation from Showdown');
      addReplay(preferences, { title: room.title || room.id, url: uploaded.url, uploadedAt: new Date().toISOString(), outcome: room.outcome });
      savePreferences(preferencesFile, preferences);
      finishedStatus(room, 'Replay saved', statusVersion);
    } catch (error) {
      if (!closing && version === navigationVersion) finishedStatus(room, 'Replay upload failed: ' + error.message, statusVersion);
    }
  });
}
function trustedPanel(event) { return event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame; }
function trustedClient(event) { return event.sender === client?.webContents && event.senderFrame === client.webContents.mainFrame && event.senderFrame.url.startsWith(CLIENT_URL); }
function toggleFullscreen() {
  if(window&&!window.isDestroyed()){hubTooltip?.hide();window.setFullScreen(!window.isFullScreen());publish();}
  return state();
}
let clientZoomTarget='showdown';
function setClientZoom(action,target='showdown') {
  if(!['showdown','showdex'].includes(target))throw new Error('Invalid zoom target.');
  const key=target==='showdex'?'showdexZoomPercent':'clientZoomPercent';
  const previous=preferences[key];
  const next=require('./client-zoom.cjs').nextZoomPercent(previous,action);
  if(next!==previous) {
    preferences[key]=next;
    try {savePreferences(preferencesFile,preferences);} catch(error) {preferences[key]=previous;throw error;}
  }
  if(client)require('./client-zoom.cjs').applyClientZoom(client.webContents,preferences);
  publish();return state();
}
function shortcutZoom(action,target='showdown') {try {setClientZoom(action,target);} catch(error) {console.error('Zoom:',error.message);}}
app.on('web-contents-created',(_event,contents)=>require('./window-shortcuts.cjs').installWindowShortcuts(contents,{
  toggleFullscreen,
  zoom:action=>shortcutZoom(action,contents===client?.webContents?clientZoomTarget:'showdown'),
  canZoom:()=>contents===window?.webContents||contents===client?.webContents,
  reload:()=>{if(client&&!client.webContents.isDestroyed())void reloadClient();},
  devTools:()=>client?.webContents.openDevTools({mode:'detach'}),
  quit:()=>app.quit(),
}));
ipcMain.handle('panel:fullscreen',event=>trustedPanel(event)?toggleFullscreen():null);
ipcMain.handle('panel:zoom', (event,action,target)=>trustedPanel(event)?setClientZoom(action,target):null);
ipcMain.handle('client:zoom-state',event=>trustedClient(event)?{clientZoomPercent:preferences.clientZoomPercent,showdexZoomPercent:preferences.showdexZoomPercent,css:require('./client-zoom.cjs').showdexZoomCSS}:null);
ipcMain.on('client:zoom-target',(event,target)=>{if(trustedClient(event)&&['showdown','showdex'].includes(target))clientZoomTarget=target;});
ipcMain.on('client:zoom', (event,action,target)=>{if(trustedClient(event)&&['in','out'].includes(action)&&['showdown','showdex'].includes(target))shortcutZoom(action,target);});
ipcMain.handle('panel:check-app-updates', async event => {if(trustedPanel(event)){await appUpdates?.check(true);return state();}});
ipcMain.handle('panel:app-update-action', async event => {if(trustedPanel(event)){await appUpdates?.action();return state();}});
ipcMain.handle('panel:state', event => trustedPanel(event) ? state() : null);
ipcMain.handle('panel:check-updates', async event => {if(trustedPanel(event)){await addonUpdates?.check(true);return state();}});
ipcMain.handle('panel:setting', (event, key, value) => { if (trustedPanel(event)) return setSetting(key, value); });
async function reloadClient() {
  if(reloadJob)return reloadJob;
  reloadJob=(async()=>{for(const popup of addonWindows)popup.close();await browserAddons.apply(preferences.addons);appliedShowdex=preferences.showdexEnabled;client.webContents.reload();publish();})().finally(()=>{reloadJob=null;});
  return reloadJob;
}
ipcMain.handle('panel:reload', event => { if (trustedPanel(event)) return reloadClient(); });
ipcMain.handle('panel:addon-options', (event,key) => {if(!trustedPanel(event))return;const url=browserAddons.optionsUrl(key);if(!url)throw new Error('Reload Showdown to enable this add-on first.');return openAddonWindow(url);});
ipcMain.on('panel:hub-tooltip', (event, visible, top, control) => {
  if (!trustedPanel(event) || !hubTooltip) return;
  const labels={
    'sidebar-toggle':preferences.sidebarCollapsed ? 'Expand Battle Hub' : 'Collapse Battle Hub',
    'fullscreen-toggle':window?.isFullScreen() ? 'Exit fullscreen (F11)' : 'Enter fullscreen (F11)',
    'zoom-out':'Zoom Showdown out',
    'zoom-in':'Zoom Showdown in',
    'zoom-reset':'Reset Showdown zoom to 100%',
    'showdex-zoom-out':'Zoom Showdex out',
    'showdex-zoom-in':'Zoom Showdex in',
    'showdex-zoom-reset':'Reset Showdex zoom to 100%',
  };
  if (visible === true && labels[control]) void hubTooltip.show({ collapsed:preferences.sidebarCollapsed, label:labels[control], theme, top, outsideHub:control.includes('zoom-') }).catch(() => hubTooltip?.hide());
  else hubTooltip.hide();
});
ipcMain.handle('panel:focus', async (event,id) => {
  if(!trustedPanel(event) || !battles.rooms.has(id)) return false;
  const focused=await client.webContents.executeJavaScript(`window.__showdownPro?.focusBattle(${JSON.stringify(id)})`);
  if(focused) client.webContents.focus();return !!focused;
});
ipcMain.handle('panel:replay', (event,url,copy) => {
  if(!trustedPanel(event) || !replayUrl(url) || !preferences.recentReplays.some(replay=>replay.url===url)) throw new Error('Saved replay unavailable.');
  if(copy===true) clipboard.writeText(url);else external(url);
});
ipcMain.on('client:receive', (event, data) => { if (trustedClient(event)) {battles.receive(data);if(!updatesIdle())addonUpdates?.cancel();} });
ipcMain.on('client:sent', (event, room, command) => { if (trustedClient(event)) battles.sent(room, command); });
// Preload requests local CSS before slow page resources finish loading.
ipcMain.handle('client:theme-css', event => trustedClient(event) ? require('./client-theme-css.cjs') : null);
ipcMain.on('client:theme', (event, value) => {
  if (trustedClient(event) && ['light', 'dark', 'pro'].includes(value) && theme !== value) {
    theme = value;
    publish();
  }
});
battles.on('room', room => {
  if (room.ended && recordBattle(lifetimeRecord, sessionRecord, room)) {
    try { saveRecord(statisticsFile, lifetimeRecord); statisticsError = null; }
    catch (error) { statisticsError = `Could not save battle record: ${error.message}`; }
  }
  if (!room.ended && postMatchStatus && room.id !== postMatchRoomId) { postMatchStatus = null; postMatchRoomId = null; postMatchStatusVersion++; }
  const finished=room.ended;
  void battleMessages.process(room,preferences.messages).then(()=>{if(finished)return processFinished(room);});
});
battles.on('change', publish);

function external(url) {
  try { if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch { /* invalid URL */ }
}
function companionUrl(url) {
  if(browserAddons?.allows(url))return true;
  try {const parsed=new URL(url);return parsed.protocol==='https:' && ['pokepast.es','crob.at'].includes(parsed.hostname) && (browserAddons?.active.has('threeIsland') || browserAddons?.active.has('pokepasteExporter'));}catch{return false;}
}
async function openAddonWindow(url) {
  if(!companionUrl(url))throw new Error('Add-on page unavailable.');
  const compact=['enhancedTooltips','threeIsland','didItTera'].some(key=>url===browserAddons.optionsUrl(key));
  const historyPage=new URL(url).protocol==='chrome-extension:' && new URL(url).hostname===browserAddons.active.get('battleHistory')?.id;
  const area=screen.getDisplayMatching(window.getBounds()).workArea;
  const width=Math.min(compact ? 480 : 1050,area.width),height=Math.min(compact ? 720 : 780,area.height);
  const popup=new BrowserWindow({parent:window,title:'Showdown add-on',icon:appIcon,x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),width,height,minWidth:Math.min(compact || historyPage ? 320 : 480,area.width),minHeight:Math.min(compact ? 180 : historyPage ? 300 : 400,area.height),show:false,webPreferences:{session:clientSession,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  setProgramIdentity(popup);
  popup.setMenu(null);
  addonWindows.add(popup);popup.on('closed',()=>addonWindows.delete(popup));
  popup.webContents.setWindowOpenHandler(({url:target})=>{if(companionUrl(target))void openAddonWindow(target).catch(error=>console.error('Add-on page:',error.message));else external(target);return {action:'deny'};});
  popup.webContents.on('will-navigate',(event,target)=>{if(!companionUrl(target)){event.preventDefault();external(target);}});
  await popup.loadURL(url);
  if(compact) {
    await popup.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    const contentHeight=await popup.webContents.executeJavaScript("Math.ceil(document.querySelector('.settings-shell').getBoundingClientRect().height)");
    const [outerWidth,outerHeight]=popup.getSize(),[,oldContentHeight]=popup.getContentSize();
    const fitHeight=Math.min(contentHeight+outerHeight-oldContentHeight,area.height);
    popup.setBounds({x:Math.round(area.x+(area.width-outerWidth)/2),y:Math.round(area.y+(area.height-fitHeight)/2),width:outerWidth,height:fitHeight});
  } else if(historyPage) {
    await popup.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
  } else if(theme==='pro' && new URL(url).protocol==='chrome-extension:') {
    await popup.webContents.executeJavaScript("document.body.classList.add('dark-mode')");
    await popup.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'addons/pro-theme.css'),'utf8'));
  }
  if (!smoke && !popup.isDestroyed()) popup.show();
  return true;
}
async function assets(request) {
  const url = new URL(request.url);
  const base = url.hostname === 'showdex' ? addonUpdates?.installed('showdex',path.join(root,'build/showdex'))||path.join(root,'build/showdex') : url.hostname === 'app' ? path.join(root, 'app/panel') : url.hostname === 'assets' ? path.join(__dirname, 'assets') : null;
  if (!base) return new Response('Not found', { status: 404 });
  let target;
  try { target = path.resolve(base, '.' + decodeURIComponent(url.pathname)); } catch { return new Response('', { status: 400 }); }
  if (!target.startsWith(base + path.sep)) return new Response('', { status: 403 });
  try {
    const response = await net.fetch(pathToFileURL(target).href);
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', 'https://play.pokemonshowdown.com');
    return new Response(response.body, { status: response.status, headers });
  } catch { return new Response('Not found', { status: 404 }); }
}
async function installClient() {
  const version = navigationVersion;
  const result = await require('./client-startup.cjs').installClientScripts({
    contents:client.webContents, clientURL:CLIENT_URL,
    bridge:fs.readFileSync(path.join(__dirname,'client-bridge.js'),'utf8'),
    themeScript:fs.readFileSync(path.join(__dirname,'client-theme.js'),'utf8'),
    themeCSS:require('./client-theme-css.cjs'), autoTimer:preferences.autoStartTimer,
    isCurrent:()=>version===navigationVersion && !closing,
    onClientReady:()=>{
      clientStatus='Official Showdown client connected';publish();
      if(preferences.sidebarTab==='history')setTimeout(()=>void refreshReplayOutcomes(),2000).unref();
    },
    getBundle:()=>appliedShowdex?path.join(addonUpdates.installed('showdex',path.join(root,'build/showdex')),'main.js'):null,
  });
  if(!result)return;
  if(result.showdexError) {
    if(addonUpdates.saved.current.showdex&&!rolledBackUpdates.has('showdex')){rolledBackUpdates.add('showdex');addonUpdates.rollback('showdex','The calculator could not initialize.');client.webContents.reload();return;}
    showdexStatus=result.showdexError.message;
  } else {showdexStatus=result.showdex?'Showdex loaded':'Disabled';addonUpdates.confirm('showdex');}
  publish();
}
async function createWindow() {
  Menu.setApplicationMenu(null);
  if (!smoke && !verifyRelease) void require('./linux-integration.cjs').installLinuxShortcuts({app,description:require('../package.json').description}).catch(error=>console.error('Linux shortcuts:',error.message));
  preferencesFile = path.join(app.getPath('userData'), 'preferences.json');
  const previousFile = path.join(app.getPath('userData'), 'assistant-preferences.json');
  preferences = loadPreferences(fs.existsSync(preferencesFile) ? preferencesFile : previousFile);
  savePreferences(preferencesFile, preferences);
  for (const obsolete of [previousFile, path.join(app.getPath('userData'), 'active-battles.json')]) fs.rmSync(obsolete, { force: true });
  if(smoke) {preferences.showdexEnabled=true;preferences.addons=Object.fromEntries(addonCatalog.map(addon=>[addon.key,false]));}
  appliedShowdex=preferences.showdexEnabled;
  appUpdates=new AppUpdates({app,distribution:require('./update-distribution.cjs'),disabled:smoke || verifyRelease,enabled:()=>preferences.autoUpdateApp,canInstall:updatesIdle,openExternal:url=>shell.openExternal(url),onChange:publish});
  const updateDirectory=smoke?path.join(root,'test-results/smoke-updates'):app.isPackaged?path.join(app.getPath('userData'),'addon-updates'):path.join(root,'build/addon-updates');
  addonUpdates=new AddonUpdates({directory:updateDirectory,prepare:smoke?async()=>({}):prepareUpdates(root,updateDirectory,{verifyBundled:verifyRelease}),canCheck:updatesIdle,onChange:publish});
  if(!smoke)addonUpdates.activatePending();
  if(smoke) {
    preferences.sidebarCollapsed=false;preferences.sidebarTab='battle';preferences.messages={...defaults.messages};
    preferences.recentReplays=[{title:'ProTest vs. Opponent',url:'https://replay.pokemonshowdown.com/gen9randombattle-123',uploadedAt:new Date().toISOString()}];
    global.__sidebarAudit={copies:[],opened:[]};
    clipboard.writeText=text=>global.__sidebarAudit.copies.push(text);
    shell.openExternal=async url=>{global.__sidebarAudit.opened.push(url);};
  }
  statisticsFile = path.join(app.getPath('userData'), 'battle-stats.json');
  lifetimeRecord = loadRecord(statisticsFile);
  clientSession = session.fromPartition(smoke ? 'persist:pro-smoke' : 'persist:showdown-pro');
  if(verifyRelease || smoke && process.argv.includes('--startup-only'))require('../scripts/audit-client.cjs').isolateAuditNetwork(clientSession);
  if(smoke)await clientSession.clearStorageData({storages:['localstorage','cookies',...(process.argv.includes('--startup-only')?['indexdb']:[])]});
  browserAddons=new BrowserAddons(root,clientSession,publish,{sourceRoot:addonUpdates.installed('addons',path.join(root,'vendor/browser-addons')),buildRoot:app.isPackaged?path.join(app.getPath('userData'),'browser-addons'):path.join(root,'build/browser-addons')});
  await browserAddons.apply(preferences.addons);
  if(browserAddons.errors.size&&addonUpdates.saved.current.addons){addonUpdates.rollback('addons','An extension could not load.');browserAddons.sourceRoot=addonUpdates.installed('addons',path.join(root,'vendor/browser-addons'));await browserAddons.apply(preferences.addons);}
  else addonUpdates.confirm('addons');
  session.defaultSession.protocol.handle('showdown-pro', assets);
  clientSession.protocol.handle('showdown-pro', assets);
  for (const ses of [session.defaultSession, clientSession]) {
    require('./client-permissions.cjs').installClientPermissions(ses, () => client?.webContents);
  }
  if (process.platform === 'darwin') app.dock.setIcon(nativeImage.createFromPath(appIcon));
  window = new BrowserWindow({ title: appTitle, icon: appIcon, width: 1580, height: 980, minWidth: 1080, minHeight: 650, show: false,
    webPreferences: { preload: path.join(__dirname, 'panel-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  setProgramIdentity(window);
  if ((!smoke && !verifyRelease) || process.argv.includes('--visible')) window.show();
  client = new WebContentsView({ webPreferences: { session: clientSession, preload: path.join(__dirname, 'client-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  require('./client-zoom.cjs').bindClientZoom(client.webContents,()=>preferences.clientZoomPercent,()=>preferences.showdexZoomPercent);
  client.webContents.on('did-start-navigation',(_event,_url,isInPlace,isMainFrame)=>{if(isMainFrame&&!isInPlace)clientZoomTarget='showdown';});
  if (smoke) client.webContents.on('console-message', details => {
    if (details.level === 'error') console.error('Client:', details.message);
  });
  if(smoke) {
    const execute=client.webContents.executeJavaScript.bind(client.webContents);
    client.webContents.executeJavaScript=(source,...args)=>execute(source,...args).catch(error=>{
      console.error('Failed smoke script:',source.slice(0,1800));throw error;
    });
  }
  window.on('resize', layout);
  for(const event of ['enter-full-screen','leave-full-screen'])window.on(event,()=>setImmediate(()=>{layout();publish();}));
  layout();
  window.on('closed', () => { closing = true; navigationVersion++; hubTooltip?.destroy(); if (!client.webContents.isDestroyed()) client.webContents.close(); window = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  client.webContents.setWindowOpenHandler(({ url }) => { if(companionUrl(url))void openAddonWindow(url).catch(error=>console.error('Add-on page:',error.message));else external(url);return { action: 'deny' }; });
  client.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== new URL(CLIENT_URL).origin) { event.preventDefault(); external(url); } });
  client.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (!mainFrame || inPlace) return;
    navigationVersion++; postMatchStatus = null; postMatchRoomId = null; postMatchStatusVersion++; battles.reset(); showdexStatus = appliedShowdex ? 'Loading…' : 'Disabled'; clientStatus = 'Connecting…'; publish();
  });
  client.webContents.on('dom-ready', () => { installClient().catch(error => { clientStatus = error.message; publish(); }); });
  client.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) { clientStatus = `Connection failed: ${description}`; publish(); }
  });
  window.setMenu(null);
  await window.loadURL('showdown-pro://app/index.html');
  window.contentView.addChildView(client);
  client.setVisible(true);
  hubTooltip = await createHubTooltip(window);
  client.webContents.on('focus', () => hubTooltip?.hide());
  layout();
  if ((!smoke && !verifyRelease) || process.argv.includes('--visible')) window.show();
  const loading = client.webContents.loadURL(smoke ? CLIENT_URL+(process.argv.includes('--new-client') || process.argv.includes('--startup-only') ? 'newclient' : 'oldclient') : CLIENT_URL+'newclient').catch(() => {});
  // Smoke checks wait for the bridge, not every third-party page resource.
  if (!smoke && !verifyRelease) await loading;
  if(verifyRelease) {
    try {await require('../scripts/audit-release-runtime.cjs')({app,window,client,root,addonUpdates,browserAddons,state});app.exit(0);}
    catch(error){console.error(error);app.exit(1);}return;
  }
  if(!smoke){appUpdateTimer=setInterval(()=>void appUpdates?.check(),60000);appUpdateTimer.unref();setTimeout(()=>void appUpdates?.check(),10000).unref();updateTimer=setInterval(checkAutoUpdates,60000);updateTimer.unref();setTimeout(checkAutoUpdates,10000).unref();}
  if (smoke) setTimeout(async () => { try {
    const assert = require('node:assert/strict');
    const waitFor = async predicate => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
      throw new Error('Smoke test timed out: ' + JSON.stringify(state()));
    };
    await waitFor(() => showdexStatus === 'Showdex loaded');
    if(process.argv.includes('--startup-only')) {
      await require('../scripts/audit-startup-defaults.cjs')({window,client,state,waitFor});
      app.exit(0);return;
    }
    if(process.argv.includes('--window-controls-only')) {
      await require('../scripts/audit-window-controls.cjs')({window,client,root,state,waitFor});
      await require('../scripts/audit-zoom.cjs')({window,client,root,state,waitFor,hubTooltip});
      app.exit(0);return;
    }
    if (!process.argv.includes('--theme-audit') && !process.argv.includes('--theme-only')) {
      await require('../scripts/audit-hub.cjs')({ window, client, root, state, hubTooltip, waitFor, actions:global.__sidebarAudit });
      app.exit(0); return;
    }
    if (process.argv.includes('--theme-audit')) {
      await require('../scripts/audit-theme.cjs')(client.webContents, root);
      app.exit(0); return;
    }
    const { nativeTheme } = require('electron');
    const selectTheme = async choice => {
      await client.webContents.executeJavaScript(`(() => {
        app.addPopup(OptionsPopup);
        const select = document.querySelector('.ps-popup select[name="theme"]');
        if (!select || !select.querySelector('option[value="pro"]')) throw new Error('Pro theme option missing');
        select.value = ${JSON.stringify(choice)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const checkbox = document.querySelector('.ps-popup input[type=checkbox]');
        if ((getComputedStyle(checkbox).appearance === 'none') !== (${JSON.stringify(choice)} === 'pro')) {
          throw new Error('Theme scope failed: settings checkbox did not use the selected theme');
        }
        app.closePopup();
      })()`);
    };
    for (const choice of ['light', 'dark', 'pro', 'system']) {
      nativeTheme.themeSource = 'light';
      await selectTheme(choice);
      const expected = choice === 'system' ? 'light' : choice;
      await waitFor(() => state().theme === expected);
      const appearance = await client.webContents.executeJavaScript(`({
        saved: Storage.prefs('theme'),
        dark: document.documentElement.classList.contains('dark'),
        pro: document.documentElement.classList.contains('showdown-pro'),
        background: getComputedStyle(document.body).backgroundImage
      })`);
      assert.equal(appearance.saved, choice);
      assert.equal(appearance.dark, choice === 'dark' || choice === 'pro');
      assert.equal(appearance.pro, choice === 'pro');
      assert.equal(appearance.background.includes('radial-gradient'), choice === 'pro');
      await waitFor(() => window.webContents.executeJavaScript(`document.documentElement.dataset.theme === ${JSON.stringify(expected)}`));
      console.log(`Theme ${choice}: native appearance and sidebar verified.`);
      if (choice === 'system') {
        nativeTheme.themeSource = 'dark';
        // Hidden smoke windows may defer media change events until rendered.
        await selectTheme('system');
        await waitFor(() => state().theme === 'dark');
      }
    }
    // Native Dark must survive a reload after the one-time Pro migration.
    await selectTheme('dark');
    console.log('Checking saved Dark after reload…');
    client.webContents.reload();
    await waitFor(() => showdexStatus === 'Loading…');
    await waitFor(() => showdexStatus === 'Showdex loaded');
    assert.equal(await client.webContents.executeJavaScript("Storage.prefs('theme')"), 'dark');
    assert.equal(await client.webContents.executeJavaScript("document.documentElement.classList.contains('showdown-pro')"), false);
    await selectTheme('pro');
    console.log('Checking saved Pro after reload…');
    client.webContents.reload();
    await waitFor(() => showdexStatus === 'Loading…');
    await waitFor(() => showdexStatus === 'Showdex loaded');
    await waitFor(() => state().theme === 'pro');
    nativeTheme.themeSource = 'system';
    console.log('Theme checks passed: Light, Dark, Pro, system palettes, and saved selections after reload.');
    if (process.argv.includes('--theme-only')) { app.exit(0); return; }
    } catch (error) { console.error(error); app.exit(1); }
  }, 18000);
}
// A second installed instance must not install an update while the first is battling.
const primaryInstance = !app.isPackaged || smoke || verifyRelease || app.requestSingleInstanceLock();
if (primaryInstance) app.whenReady().then(createWindow).catch(error => { console.error(error); app.exit(1); });
else app.quit();
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
app.on('before-quit', () => { clearInterval(updateTimer);clearInterval(appUpdateTimer);appUpdates?.stop();addonUpdates?.stop(); closing = true; navigationVersion++; });
app.on('window-all-closed', () => app.quit());
