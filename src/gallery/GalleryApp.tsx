import React, { useEffect, useState } from 'react';
import { EmptyState } from '../design-system';
import { fetchGalleryBundle } from './fetchBundle';
import type { GalleryBundle } from './galleryBundle';
import type { GalleryConsoleView } from './GalleryConsole';
import { GalleryStage } from './GalleryStage';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'ready'; bundle: GalleryBundle; Console: GalleryConsoleView | null }
  | { kind: 'missing' };

const consoleFor = (bundle: GalleryBundle): Promise<GalleryConsoleView | null> =>
  bundle.case.console
    ? import('./GalleryConsole').then(
        (m) => m.GalleryConsole,
        () => null,
      )
    : Promise.resolve(null);

async function loadGallery(source: string) {
  const bundle = await fetchGalleryBundle(source);

  return { bundle, Console: await consoleFor(bundle) };
}

export const GalleryApp: React.FC<{ source: string }> = ({ source }) => {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    let live = true;

    loadGallery(source)
      .then((ready) => live && setLoaded({ kind: 'ready', ...ready }))
      .catch(() => live && setLoaded({ kind: 'missing' }));

    return () => {
      live = false;
    };
  }, [source]);

  if (loaded.kind === 'ready') return <GalleryStage bundle={loaded.bundle} Console={loaded.Console} />;

  return (
    <div className="fixed inset-0 bg-[#1b1b1b] flex items-center justify-center">
      {loaded.kind === 'missing' && (
        <EmptyState title="No Case here" description="Check the link, or open Basecase to make your own." />
      )}
    </div>
  );
};
