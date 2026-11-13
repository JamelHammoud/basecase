import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { finishBoot } from '../app/boot';
import { GalleryApp } from './GalleryApp';

export function mountGallery(source: string) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <GalleryApp source={source} />
    </StrictMode>,
  );
  requestAnimationFrame(finishBoot);
}
