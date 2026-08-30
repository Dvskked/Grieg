/**
 * main.js — Proceso principal (Electron) de la nueva arquitectura.
 * Carga index.html, reenvia consola del renderer y soporta SMOKE tests.
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: true,
    backgroundColor: '#05060a',
    title: 'Grieg: La Sombra del Olimpo — Mazmorra',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const smoke = process.env.SMOKE || '';
  const hash = smoke === '2' ? 'selftest' : (smoke === '3' ? 'drive' : '');
  win.loadFile('index.html', hash ? { hash } : {});

  win.webContents.on('console-message', (e, _level, messageOrDetails) => {
    const msg = typeof messageOrDetails === 'string' ? messageOrDetails : (messageOrDetails && messageOrDetails.message);
    if (msg) console.log('[renderer] ' + msg);
  });

  // SMOKE=1: comprobacion de arranque limpio (se cierra solo).
  if (smoke === '1') setTimeout(() => app.quit(), 8000);
}

ipcMain.on('quit', () => app.quit());
ipcMain.on('log', (_e, m) => console.log('[renderer] ' + m));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());