import { createRoot } from 'react-dom/client';
import '../index.css';
import { finishBoot } from '../app/boot';
import { ClassroomApp } from './ClassroomApp';
import { showAttempt } from './storage';

const attempt = new URLSearchParams(location.search).get('attempt');

if (attempt && /^attempt-[a-f0-9-]{36}$/.test(attempt)) showAttempt(attempt);
else {
  createRoot(document.getElementById('root')!).render(<ClassroomApp />);
  requestAnimationFrame(finishBoot);
}
