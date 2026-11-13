import React, { useEffect, useState } from 'react';
import { EmptyState } from '../design-system';
import { fetchGalleryBundle } from './fetchBundle';
import type { GalleryBundle } from './galleryBundle';
import { GalleryStage } from './GalleryStage';

type Loaded = { kind: 'loading' } | { kind: 'ready'; bundle: GalleryBundle } | { kind: 'missing' };

export const GalleryApp: React.FC<{ source: string }> = ({ source }) => {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    let live = true;

    fetchGalleryBundle(source)
      .then((bundle) => live && setLoaded({ kind: 'ready', bundle }))
      .catch(() => live && setLoaded({ kind: 'missing' }));

    return () => {
      live = false;
    };
  }, [source]);

  if (loaded.kind === 'ready') return <GalleryStage bundle={loaded.bundle} />;

  return (
    <div className="fixed inset-0 bg-[#1b1b1b] flex items-center justify-center">
      {loaded.kind === 'missing' && (
        <EmptyState title="No Case here" description="Check the link, or open Basecase to make your own." />
      )}
    </div>
  );
};
