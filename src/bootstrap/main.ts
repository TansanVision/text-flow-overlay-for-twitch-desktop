import { app, BrowserWindow } from 'electron';
import { createControlPanelWindow } from '../infrastructure/electron/create-control-panel-window.js';
import { createOverlayWindow } from '../infrastructure/electron/create-overlay-window.js';
import { LocalHttpServer } from '../infrastructure/http/local-http-server.js';

let localServer: LocalHttpServer | undefined;
let isQuitting = false;

app.whenReady().then(async () => {
  localServer = new LocalHttpServer();
  const origin = await localServer.start();

  createControlPanelWindow(origin);
  createOverlayWindow(origin);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlPanelWindow(origin);
      createOverlayWindow(origin);
    }
  });
});

app.on('before-quit', (event) => {
  if (isQuitting || !localServer) {
    return;
  }

  event.preventDefault();
  isQuitting = true;

  void localServer.stop().finally(() => {
    localServer = undefined;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
