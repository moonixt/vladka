const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nativeApp', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
})
