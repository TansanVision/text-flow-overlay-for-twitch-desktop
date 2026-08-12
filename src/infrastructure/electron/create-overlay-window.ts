import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow } from 'electron';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createOverlayWindow(origin: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: 'Twitch Text Flow Overlay',
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    show: true,
    skipTaskbar: true,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(currentDirectory, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setIgnoreMouseEvents(true);
  void window.loadURL(`${origin}/overlay`);

  return window;
}
