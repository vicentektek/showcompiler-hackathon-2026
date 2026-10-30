'use strict';

// Experimental Electron shell; no changes to RUNQ's browser audio/GO engine.
const { app, BrowserWindow, session } = require('electron');
const { sameAppOrigin, allowAudioOnly } = require('./security.cjs');
const { join } = require('node:path');

let windowRef = null;
let httpServer = null;
let appOrigin = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!windowRef) return;
    if (windowRef.isMinimized()) windowRef.restore();
    windowRef.focus();
  });

  app.whenReady().then(start).catch(error => {
    console.error('RUNQ desktop startup failed:', error?.message || String(error));
    app.quit();
  });
}

async function start() {
  // Inside electron-builder's asar, local .mjs assets resolve relative to
  // this main file. Electron embeds Node; no external npm dev server required.
  const { createAppServer } = await import('../tools/dev-server.mjs');
  httpServer = createAppServer();
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  const bound = httpServer.address();
  if (!bound || typeof bound === 'string') throw new Error('Local server did not bind');
  appOrigin = 'http://127.0.0.1:' + bound.port;

  // No default permission allow-list. Requests from the owned loopback
  // origin can use audio input only; all other origin/media requests denied.
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) =>
    allowAudioOnly({
      permission, requestingUrl: requestingOrigin,
      expectedOrigin: appOrigin, mediaType: details?.mediaType,
    })
  );
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowAudioOnly({
      permission, requestingUrl: wc?.getURL?.() || '',
      expectedOrigin: appOrigin, mediaTypes: details?.mediaTypes,
    }));
  });

  windowRef = new BrowserWindow({
    title: 'RUNQ — Studio / Stage',
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    show: false, backgroundColor: '#14181F',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      devTools: !app.isPackaged, webviewTag: false,
    },
  });
  windowRef.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowRef.webContents.on('will-navigate', (event, target) => {
    if (!sameAppOrigin(target, appOrigin)) event.preventDefault();
  });
  windowRef.once('ready-to-show', () => windowRef?.show());
  windowRef.on('closed', () => { windowRef = null; app.quit(); });
  await windowRef.loadURL(appOrigin);
}

// Make the server's lifetime equal to the one RUNQ window. No background
// process, automatic remote retry, audio-engine duplication or update agent.
app.on('before-quit', () => {
  if (httpServer) {
    httpServer.closeAllConnections?.();
    httpServer.close();
    httpServer = null;
  }
});
app.on('window-all-closed', () => app.quit());
