import { finishBoot } from '../app/boot';
import { renderLanding } from './renderLanding';

renderLanding();
requestAnimationFrame(finishBoot);
