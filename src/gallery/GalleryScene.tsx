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
  onOpenScene,
  embedded,
}: {
  bundle: GalleryBundle;
  Console: GalleryConsoleView | null;
  replay?: SeedReplay;
  onOpenScene?: () => void;
  embedded?: boolean;
}) {
  const [scope] = useState(() => createVisionScope(`gallery-${bundle.slug}`));

  return (
    <VisionScopeContext value={scope}>
      <GalleryStage bundle={bundle} Console={Console} replay={replay} onOpenScene={onOpenScene} embedded={embedded} />
    </VisionScopeContext>
  );
}
