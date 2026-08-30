/**
 * preload.js — Puente seguro renderer <-> main (contextBridge).
 * Expone un minimo de API para logs y salida de los tests automaticos.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('griegAPI', {
  log: (m) => ipcRenderer.send('log', m),
  quit: () => ipcRenderer.send('quit')
});