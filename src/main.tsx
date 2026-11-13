import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { WindowBoundary } from './app/WindowBoundary';
import { ConfirmHost } from './design-system/ConfirmHost';
import { crashRegion } from './design-system/crashProbe';
import { OverlayScrollbars } from './design-system/OverlayScrollbars';
import { startRobotStore } from './robot/robotStore';
import { refreshRates } from './utils/currencyStore';
import { exposesTestHooks } from './utils/platform/testHooks';

const electronAPI = window.electronAPI;

if (electronAPI?.isElectron) {
  const setFullScreen = (value: boolean) => document.documentElement.classList.toggle('is-fullscreen', value);

  electronAPI.isFullScreen().then(setFullScreen);
  electronAPI.onFullScreenChange(setFullScreen);
  startRobotStore(electronAPI);
}

refreshRates();

if (exposesTestHooks()) Object.assign(window, { __crashRegion: crashRegion });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WindowBoundary>
      <App />
      <OverlayScrollbars />
      <ConfirmHost />
    </WindowBoundary>
  </StrictMode>,
);
