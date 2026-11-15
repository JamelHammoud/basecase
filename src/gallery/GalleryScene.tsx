import { useState } from 'react';
import { createVisionScope, VisionScopeContext } from '../cameras/visionScope';
import type { GalleryBundle } from './galleryBundle';
import type { GalleryConsoleView } from './GalleryConsole';
import { GalleryStage } from './GalleryStage';

export function GalleryScene({ bundle, Console }: { bundle: GalleryBundle; Console: GalleryConsoleView | null }) {
  const [scope] = useState(() => createVisionScope(`gallery-${bundle.slug}`));

  return (
    <VisionScopeContext value={scope}>
      <GalleryStage bundle={bundle} Console={Console} />
    </VisionScopeContext>
  );
}
