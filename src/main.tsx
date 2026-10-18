import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { OverlayScrollbars } from './design-system/OverlayScrollbars';

const electronAPI = window.electronAPI;

if (electronAPI?.isElectron) {
  const root = document.documentElement;

  root.classList.add('is-electron');

  const setFullScreen = (value: boolean) => root.classList.toggle('is-fullscreen', value);

  electronAPI.isFullScreen().then(setFullScreen);
  electronAPI.onFullScreenChange(setFullScreen);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <OverlayScrollbars />
  </StrictMode>,
);
