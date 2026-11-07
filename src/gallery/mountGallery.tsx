import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { GalleryApp } from './GalleryApp';

export function mountGallery(slug: string) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <GalleryApp slug={slug} />
    </StrictMode>,
  );
}
