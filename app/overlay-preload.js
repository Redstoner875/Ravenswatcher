'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', {
  subscribe: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('overlay:map', listener);
    return () => ipcRenderer.removeListener('overlay:map', listener);
  },
  resize: size => ipcRenderer.send('overlay:resize', size),
});
