import { createRoot } from 'react-dom/client';
import '../../index.css';
import { finishBoot } from '../../app/boot';
import { FleetApp } from './FleetApp';

document.title = 'Basecase Fleet';
createRoot(document.getElementById('root')!).render(<FleetApp />);

requestAnimationFrame(finishBoot);
