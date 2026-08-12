import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow } from 'electron';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createControlPanelWindow(origin: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 480,
    title: 'Twitch Text Flow Overlay Desktop',
    backgroundColor: '#15171d',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void window.loadURL(`${origin}/`);

  return window;
}
