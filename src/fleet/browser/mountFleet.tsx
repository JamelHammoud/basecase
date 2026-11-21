import { createRoot } from 'react-dom/client';
import '../../index.css';
import { finishBoot } from '../../app/boot';
import { OverlayScrollbars } from '../../design-system/OverlayScrollbars';
import { FleetApp } from './FleetApp';

document.title = 'Basecase Fleet';
createRoot(document.getElementById('root')!).render(
  <>
    <FleetApp />
    <OverlayScrollbars />
  </>,
);

requestAnimationFrame(finishBoot);
