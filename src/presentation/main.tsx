import React from 'react';
import { createRoot } from 'react-dom/client';
import { ControlPanel } from './control-panel/control-panel';
import { Overlay } from './overlay/overlay';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element was not found.');
}

const isOverlay = new URLSearchParams(window.location.search).get('view') === 'overlay';
const pageClass = isOverlay ? 'overlay-page' : 'control-panel-page';
document.documentElement.className = pageClass;
document.body.className = pageClass;

createRoot(rootElement).render(
  <React.StrictMode>{isOverlay ? <Overlay /> : <ControlPanel />}</React.StrictMode>,
);
