import { useState } from 'react';
import type { SeedReplay } from '../cases/seedReplay';
import { createVisionScope, VisionScopeContext } from '../cameras/visionScope';
import type { GalleryBundle } from './galleryBundle';
import type { GalleryConsoleView } from './GalleryConsole';
import { GalleryStage } from './GalleryStage';

export function GalleryScene({
  bundle,
  Console,
  replay,
}: {
  bundle: GalleryBundle;
  Console: GalleryConsoleView | null;
  replay?: SeedReplay;
}) {
  const [scope] = useState(() => createVisionScope(`gallery-${bundle.slug}`));

  return (
    <VisionScopeContext value={scope}>
      <GalleryStage bundle={bundle} Console={Console} replay={replay} />
    </VisionScopeContext>
  );
}
