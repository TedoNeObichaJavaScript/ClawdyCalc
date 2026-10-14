// The only bridge between the page and the desktop window. The page sees `window.clawdy`;
// it never gets Node or Electron itself.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clawdy', {
  getState: () => ipcRenderer.invoke('win:get-state'),
  setPinned: (on) => ipcRenderer.invoke('win:pin', !!on),
  setCompact: (on, height) => ipcRenderer.invoke('win:compact', !!on, Number(height) || 0),
  minimize: () => ipcRenderer.send('win:minimize'),
  hide: () => ipcRenderer.send('win:hide'),
  setSummary: (text) => ipcRenderer.send('win:summary', String(text)),
  setBackground: (color) => ipcRenderer.send('win:background', String(color)),
  onState: (fn) => ipcRenderer.on('win:state', (_e, s) => fn(s)),
  onToggleCompact: (fn) => ipcRenderer.on('win:toggle-compact', () => fn()),
});
