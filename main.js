// main.js - FINAL CORRECTED VERSION

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Notification, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const Papa = require('papaparse');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { v4: uuidv4 } = require('uuid');

// --- Auto Updater Configuration ---
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// --- Paths Configuration ---
const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'data.json');
const settingsFilePath = path.join(userDataPath, 'settings.json');
const documentsPath = path.join(userDataPath, 'documents');
const backupsPath = path.join(userDataPath, 'backups');

// Ensure directories exist
if (!fs.existsSync(documentsPath)) fs.mkdirSync(documentsPath, { recursive: true });
if (!fs.existsSync(backupsPath)) fs.mkdirSync(backupsPath, { recursive: true });

let mainWindow;

// --- Helper Functions ---
const formatDate = (dateStr) => !dateStr ? '—' : new Date(dateStr).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

// --- Automatic Backup Function ---
function handleAutomaticBackup() {
    if (!fs.existsSync(dataFilePath)) return;
    const today = new Date().toISOString().split('T')[0];
    const backupFilePath = path.join(backupsPath, `data-backup-${today}.json`);
    if (fs.existsSync(backupFilePath)) return;
    try {
        fs.copyFileSync(dataFilePath, backupFilePath);
        log.info(`Successfully created daily backup: ${backupFilePath}`);
        const files = fs.readdirSync(backupsPath);
        files.forEach(file => {
            const filePath = path.join(backupsPath, file);
            const stat = fs.statSync(filePath);
            const sevenDaysAgo = new Date().setDate(new Date().getDate() - 7);
            if (stat.mtime < sevenDaysAgo) {
                fs.unlinkSync(filePath);
                log.info(`Deleted old backup: ${file}`);
            }
        });
    } catch (error) {
        log.error('Failed to create or clean up backups:', error);
    }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  let isQuitting = false;
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault(); 
      log.info('Window close intercepted. Attempting to save data...');
      mainWindow.webContents.send('app-closing-save-data');
      ipcMain.once('data-saved-before-quit', () => {
        log.info('Data saved. Proceeding to quit.');
        isQuitting = true;
        app.quit();
      });
      setTimeout(() => {
          if (!isQuitting) {
              log.warn('Renderer did not confirm save, forcing quit.');
              isQuitting = true;
              app.quit();
          }
      }, 2000);
    }
  });
}

const menuTemplate = [
  {
    label: 'File',
    submenu: [
      { label: 'Save Data', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('trigger-save') },
      { label: 'Backup Data As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('trigger-backup') },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'View',
    submenu: [ { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' } ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About',
        click: () => {
          dialog.showMessageBox(mainWindow, { type: 'info', title: 'About', message: 'Rental Management System v1.4.0', detail: 'Created by Dr. Johnny Marshy.' });
        }
      }
    ]
  }
];

app.whenReady().then(() => {
  handleAutomaticBackup();
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// --- IPC Handlers ---

ipcMain.handle('get-system-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
});

// Settings
ipcMain.handle('load-settings', () => {
    const defaults = { 
        notifyLeaseExpiry: true, 
        notifyLeaseDays: 30, 
        currencySymbol: '₪',
        accentColor: '#0d6efd',
        theme: 'system',
        graphColor: '#22c55e',
        animationsEnabled: true,
        customFields: []
    };
    try {
        if (fs.existsSync(settingsFilePath)) {
            const savedSettings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
            return { ...defaults, ...savedSettings };
        }
    } catch (e) { log.error('Could not load settings:', e); }
    return defaults;
});
ipcMain.handle('save-settings', (event, settings) => {
    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// Data
ipcMain.handle('load-data', () => {
    try { if (fs.existsSync(dataFilePath)) return JSON.parse(fs.readFileSync(dataFilePath, 'utf8')); } catch (e) { log.error(e); }
    return { properties: [], tenants: [], events: [], expenses: [], payments: [] };
});
ipcMain.handle('save-data', (event, data) => {
    try { fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2)); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('backup-data', async (event, data) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Data Backup', defaultPath: `rent-manager-backup-${new Date().toISOString().split('T')[0]}.json` });
    if (!canceled && filePath) {
        try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); return { success: true, path: filePath }; } catch (e) { return { success: false, error: e.message }; }
    }
    return { success: false, error: 'Backup canceled by user.' };
});

ipcMain.handle('restore-data-from-backup', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Restore from Backup',
        filters: [{ name: 'JSON Backup', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) {
        return { success: false, error: 'Restore canceled by user.' };
    }
    try {
        const fileContent = fs.readFileSync(filePaths[0], 'utf8');
        const data = JSON.parse(fileContent);
        if (data.properties && data.tenants) {
            return { success: true, data };
        } else {
            return { success: false, error: 'Invalid backup file format.' };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.on('open-data-folder', () => shell.showItemInFolder(dataFilePath));

// Documents
ipcMain.handle('upload-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (canceled || filePaths.length === 0) return { success: false };
    const originalPath = filePaths[0];
    const originalName = path.basename(originalPath);
    const fileId = `${uuidv4()}${path.extname(originalPath)}`;
    const newPath = path.join(documentsPath, fileId);
    try {
        fs.copyFileSync(originalPath, newPath);
        return { success: true, fileId, originalName };
    } catch (error) { return { success: false, error: error.message }; }
});
ipcMain.on('open-document', (event, fileId) => {
    const docPath = path.join(documentsPath, fileId);
    if (fs.existsSync(docPath)) {
        shell.openPath(docPath).catch(err => log.error('Failed to open document:', err));
    } else {
        dialog.showErrorBox('File Not Found', 'The requested document could not be found. It may have been moved or deleted.');
    }
});

// CSV Import
ipcMain.handle('import-csv', async (event, type) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (canceled || filePaths.length === 0) return { success: false };
    try {
        const csvString = fs.readFileSync(filePaths[0], 'utf8');
        const parsed = Papa.parse(csvString, { header: true, skipEmptyLines: true });
        return { success: true, data: parsed.data };
    } catch (error) { return { success: false, error: error.message }; }
});


// Notifications
ipcMain.on('check-for-notifications', (event, { tenants, settings }) => {
    if (!settings || !settings.notifyLeaseExpiry || !tenants) return;
    const today = new Date();
    tenants.forEach(tenant => {
        if (tenant.is_active && tenant.contract_end_date) {
            const endDate = new Date(tenant.contract_end_date);
            const daysUntilExpiry = Math.round((endDate - today) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry > 0 && daysUntilExpiry <= settings.notifyLeaseDays) {
                new Notification({
                    title: 'Lease Expiry Reminder',
                    body: `The lease for ${tenant.name} is expiring in ${daysUntilExpiry} days on ${formatDate(tenant.contract_end_date)}.`
                }).show();
            }
        }
    });
});

// Context Menu
ipcMain.on('show-context-menu', (event, menuItems) => {
    const template = menuItems.map(item => ({ label: item.label, click: () => event.sender.send('context-menu-command', item.action) }));
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

// --- Auto Updater Events ---
autoUpdater.on('update-available', () => mainWindow.webContents.send('update-available'));
autoUpdater.on('update-downloaded', () => mainWindow.webContents.send('update-downloaded'));

ipcMain.on('restart-app', () => {
    autoUpdater.quitAndInstall();
});