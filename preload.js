// preload.js - FINAL CORRECTED VERSION

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // System Theme & External Links
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),

  // --- Data & Backups ---
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  backupData: (data) => ipcRenderer.invoke('backup-data', data),
  openDataFolder: () => ipcRenderer.send('open-data-folder'),
  restoreDataFromBackup: () => ipcRenderer.invoke('restore-data-from-backup'),

  // --- Settings ---
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // --- Document Management ---
  uploadFile: () => ipcRenderer.invoke('upload-file'),
  openDocument: (fileId) => ipcRenderer.send('open-document', fileId),
  
  // --- CSV Import ---
  importCSV: (type) => ipcRenderer.invoke('import-csv', type),
  
  // --- Proactive Notifications ---
  checkForNotifications: (data) => ipcRenderer.send('check-for-notifications', data),
  
  // --- Native Menu & Context Menu Communication ---
  onTriggerSave: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('trigger-save', handler);
    return () => ipcRenderer.removeListener('trigger-save', handler);
  },
  onTriggerBackup: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('trigger-backup', handler);
    return () => ipcRenderer.removeListener('trigger-backup', handler);
  },
  showContextMenu: (menuItems) => ipcRenderer.send('show-context-menu', menuItems),
  onContextMenuCommand: (callback) => {
    const handler = (event, ...args) => callback(...args);
    ipcRenderer.on('context-menu-command', handler);
    return () => ipcRenderer.removeListener('context-menu-command', handler);
  },

  // --- Auto Updater ---
  onUpdateAvailable: (callback) => {
    const handler = (event, ...args) => callback(...args);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (event, ...args) => callback(...args);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  restartApp: () => ipcRenderer.send('restart-app'),

  // --- Auto-Save on Quit ---
  onAppClosing: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app-closing-save-data', handler);
    return () => ipcRenderer.removeListener('app-closing-save-data', handler);
  },
  notifyDataSaved: () => ipcRenderer.send('data-saved-before-quit'),
});