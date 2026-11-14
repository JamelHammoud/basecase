import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ConfirmHost } from './design-system/ConfirmHost';
import { OverlayScrollbars } from './design-system/OverlayScrollbars';
import { PairPhoneHost } from './components/phone/PairPhoneHost';
import { platformPhoneLink } from './phone/phoneLink';
import { setPhoneLink } from './phone/phoneStore';
import { startRobotStore } from './robot/robotStore';
import { startTakeVideo } from './robot/takeVideo';
import { refreshRates } from './utils/currencyStore';

const electronAPI = window.electronAPI;

if (electronAPI?.isElectron) {
  const setFullScreen = (value: boolean) => document.documentElement.classList.toggle('is-fullscreen', value);

  electronAPI.isFullScreen().then(setFullScreen);
  electronAPI.onFullScreenChange(setFullScreen);
  startRobotStore(electronAPI);
  startTakeVideo();
}

setPhoneLink(platformPhoneLink());
refreshRates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <OverlayScrollbars />
    <ConfirmHost />
    <PairPhoneHost />
  </StrictMode>,
);
