import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './landing.css';
import { Landing, type LandingProps } from './Landing';

export function renderLanding(props: LandingProps = {}) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Landing {...props} />
    </StrictMode>,
  );
}
