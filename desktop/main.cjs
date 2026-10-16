const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');
let runtime;
let mainWindow;
app.setName('OpenBuddy');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    const { startServer } = await import('../server/index.js');
    runtime = await startServer({ dataDir: path.join(app.getPath('userData'), 'openbuddy-data'), port: 0 });
    const origin = `http://127.0.0.1:${runtime.port}`;
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    mainWindow = new BrowserWindow({ width: 1440, height: 940, minWidth: 840, minHeight: 620, title: 'OpenBuddy · 本地工作台', backgroundColor: '#F8F9FA', webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`${origin}/`)) { event.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
    await mainWindow.loadURL(origin);
  }).catch(error => { console.error('OpenBuddy 启动失败：', error.name); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  let quitting = false;
  app.on('before-quit', event => { if (!quitting && runtime) { event.preventDefault(); quitting = true; runtime.close().finally(() => app.quit()); } });
}
