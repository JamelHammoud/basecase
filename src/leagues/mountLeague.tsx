import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { finishBoot } from '../app/boot';
import { LeagueApp } from './LeagueApp';

export function mountLeague(source: string) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LeagueApp source={source} />
    </StrictMode>,
  );
  requestAnimationFrame(finishBoot);
}
