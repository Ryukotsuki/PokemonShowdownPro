const { contextBridge, ipcRenderer, webFrame } = require('electron');
// The remote page only reports protocol events. It cannot change app settings or spawn processes.
contextBridge.exposeInMainWorld('showdownProEvents', Object.freeze({
  receive: data => { if (typeof data === 'string' && data.length <= 8 * 1024 * 1024) ipcRenderer.send('client:receive', data); },
  sent: (room, command) => { if (typeof room === 'string' && typeof command === 'string' && command.length < 512) ipcRenderer.send('client:sent', room, command); },
}));

// Seed the shared preference before either client reads it, then paint Pro
// without waiting for executeJavaScript's page-load gate or a socket connection.
if (location.origin === 'https://play.pokemonshowdown.com' && window.top === window) {
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
