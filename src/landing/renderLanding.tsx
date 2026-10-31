import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './landing.css';
import { Landing } from './Landing';

export function renderLanding(browserApp?: string) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Landing browserApp={browserApp} />
    </StrictMode>,
  );
}
