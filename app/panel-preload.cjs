const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pro', {
  getState: () => ipcRenderer.invoke('panel:state'),
  setSetting: (key, value) => ipcRenderer.invoke('panel:setting', key, value),
  reload: () => ipcRenderer.invoke('panel:reload'),
  toggleFullscreen: () => ipcRenderer.invoke('panel:fullscreen'),
  zoom: (action,target='showdown') => ipcRenderer.invoke('panel:zoom',action,target),
  checkAppUpdates: () => ipcRenderer.invoke('panel:check-app-updates'),
  appUpdateAction: () => ipcRenderer.invoke('panel:app-update-action'),
  checkUpdates: () => ipcRenderer.invoke('panel:check-updates'),
  showHubTooltip: (visible, top, control) => ipcRenderer.send('panel:hub-tooltip', visible, top, control),
  addonOptions: key => ipcRenderer.invoke('panel:addon-options',key),
  focusBattle: room => ipcRenderer.invoke('panel:focus',room),
  openReplay: url => ipcRenderer.invoke('panel:replay',url,false),
  copyReplay: url => ipcRenderer.invoke('panel:replay',url,true),
  onState: callback => ipcRenderer.on('panel:update', (_event, state) => callback(state)),
});
