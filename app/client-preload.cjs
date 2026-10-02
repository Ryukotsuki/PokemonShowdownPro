const { contextBridge, ipcRenderer } = require('electron');
// The remote page only reports protocol events. It cannot change app settings or spawn processes.
contextBridge.exposeInMainWorld('showdownProEvents', Object.freeze({
  receive: data => { if (typeof data === 'string' && data.length <= 8 * 1024 * 1024) ipcRenderer.send('client:receive', data); },
  sent: (room, command) => { if (typeof room === 'string' && typeof command === 'string' && command.length < 512) ipcRenderer.send('client:sent', room, command); },
}));

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
