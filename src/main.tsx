import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ConfirmHost } from './design-system/ConfirmHost';
import { OverlayScrollbars } from './design-system/OverlayScrollbars';
import { refreshRates } from './utils/currencyStore';

const electronAPI = window.electronAPI;

if (electronAPI?.isElectron) {
  const setFullScreen = (value: boolean) => document.documentElement.classList.toggle('is-fullscreen', value);

  electronAPI.isFullScreen().then(setFullScreen);
  electronAPI.onFullScreenChange(setFullScreen);
}

refreshRates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <OverlayScrollbars />
    <ConfirmHost />
  </StrictMode>,
);
