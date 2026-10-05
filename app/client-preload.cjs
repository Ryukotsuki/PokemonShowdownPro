const { contextBridge, ipcRenderer, webFrame } = require('electron');
// The remote page only reports protocol events. It cannot change app settings or spawn processes.
contextBridge.exposeInMainWorld('showdownProEvents', Object.freeze({
  receive: data => { if (typeof data === 'string' && data.length <= 8 * 1024 * 1024) ipcRenderer.send('client:receive', data); },
  sent: (room, command) => { if (typeof room === 'string' && typeof command === 'string' && command.length < 512) ipcRenderer.send('client:sent', room, command); },
}));

// Seed the shared preference before either client reads it, then paint Pro
// without waiting for executeJavaScript's page-load gate or a socket connection.
if (location.origin === 'https://play.pokemonshowdown.com' && window.top === window) {
  let zoomState;
  const applyZoom = value => {
    if(value)zoomState=value;
    if(!zoomState || !document.documentElement)return;
    // Compensate for page zoom so Showdex keeps its own absolute percentage.
    document.documentElement.style.setProperty('--showdown-pro-showdex-zoom',String(zoomState.showdexZoomPercent/zoomState.clientZoomPercent));
    window.dispatchEvent(new Event('resize'));
  };
  ipcRenderer.on('client:zoom-state',(_event,value)=>applyZoom(value));
  ipcRenderer.invoke('client:zoom-state').then(value=>{
    if(!value)return;
    webFrame.insertCSS(value.css,{cssOrigin:'user'});
    // A load notification may already contain a newer setting.
    applyZoom(zoomState||value);
  }).catch(error=>console.error('Client zoom:',error.message));
  const zoomObserver=new MutationObserver(()=>{
    if(document.documentElement){applyZoom();zoomObserver.disconnect();}
  });
  zoomObserver.observe(document,{childList:true,subtree:true});
  const zoomTarget = event => event.target?.closest?.('[data-showdex-module], [class*="Tooltip-module-container-"]') ? 'showdex' : 'showdown';
  for(const type of ['pointerdown','focusin'])window.addEventListener(type,event=>{
    if(event.isTrusted)ipcRenderer.send('client:zoom-target',zoomTarget(event));
  },{capture:true});
  // Handle only real Ctrl+wheel input in this isolated preload. Cancel native
  // wheel zoom so it cannot drift away from Pro's saved percentage.
  window.addEventListener('wheel',event=>{
    if(!event.isTrusted || !event.ctrlKey || !event.deltaY)return;
    event.preventDefault();
    ipcRenderer.send('client:zoom',event.deltaY<0?'in':'out',zoomTarget(event));
  },{capture:true,passive:false});
  let choice = 'pro';
  try {
    const value = JSON.parse(localStorage.getItem('showdown_prefs') || '{}');
    const prefs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    if (!prefs.showdownProThemeVersion) {
      if (!prefs.theme || prefs.theme === 'dark') prefs.theme = 'pro';
      prefs.showdownProThemeVersion = 1;
    }
    if (!['light', 'dark', 'pro', 'system'].includes(prefs.theme)) prefs.theme = 'pro';
    choice = prefs.theme;
    localStorage.setItem('showdown_prefs', JSON.stringify(prefs));
  } catch { /* Storage may be unavailable; keep the first-run Pro appearance. */ }
  const system = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const root = document.documentElement;
    if (!root) return;
    if (root.dataset.showdownProThemeReady) { observer.disconnect(); return; }
    const pro = choice === 'pro';
    const dark = pro || choice === 'dark' || choice === 'system' && system.matches;
    root.classList.toggle('showdown-pro', pro);
    root.classList.toggle('dark', dark);
    const newClient = location.pathname === '/newclient' || !!document.querySelector('link[href*="/style/client2.css"]');
    if (newClient && !root.classList.contains('showdown-new-client')) root.classList.add('showdown-new-client');
    if (newClient) document.body?.classList.toggle('dark', dark);
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' ||
        record.target === document.documentElement || record.target === document.body)) apply();
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'data-showdown-pro-theme-ready'] });
  apply();
  ipcRenderer.invoke('client:theme-css').then(css => {
    if (typeof css === 'string') webFrame.insertCSS(css, { cssOrigin: 'user' });
  }).catch(error => console.error('Pro startup styling:', error.message));
}

// Follow the theme Showdown actually renders, including its System setting.
// Classic uses html.dark; the newer client uses body.dark.
window.addEventListener('DOMContentLoaded', () => {
  let previous;
  const syncTheme = () => {
    const theme = document.documentElement.classList.contains('showdown-pro') ? 'pro' : document.documentElement.classList.contains('dark') || document.body?.classList.contains('dark') ? 'dark' : 'light';
    if (theme === previous) return;
    previous = theme;
    ipcRenderer.send('client:theme', theme);
  };
  const observer = new MutationObserver(syncTheme);
  for (const element of [document.documentElement, document.body]) {
    if (element) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
  }
  syncTheme();
}, { once: true });
