import type { VisionResult } from '../src/vision/types';

export interface VisionState {
  signals: Record<string, number>;
  results: Record<string, VisionResult | null>;
  models: Record<string, VisionResult | null>;
}

export function operatorOverlayState(requireFace = false) {
  const studio = (window as unknown as { __studio?: { cameraVisionState: () => VisionState } }).__studio;
  const visible = (element: Element) => {
    const { width, height } = element.getBoundingClientRect();

    return (
      !element.closest('[inert]') && element.checkVisibility({ visibilityProperty: true }) && width > 0 && height > 0
    );
  };
  const tiles = [...document.querySelectorAll('[data-camera="operator"][data-testid="camera-tile"]')].map((tile) => ({
    visible: visible(tile),
    overlays: [...tile.querySelectorAll('[data-testid="vision-overlay"]')].map((overlay) => ({
      timestamp: overlay.getAttribute('data-timestamp'),
      faces: overlay.querySelectorAll('[data-testid="vision-box"][data-label="face"]').length,
    })),
  }));
  const faces = document.querySelectorAll('[data-camera="operator"] [data-testid="vision-box"][data-label="face"]');

  const snapshot = {
    at: performance.now(),
    visibleTiles: tiles.filter((tile) => tile.visible).length,
    visibleFaces: [...faces].filter(visible).length,
    tiles,
    vision: studio?.cameraVisionState(),
  };

  if (
    requireFace &&
    (snapshot.visibleTiles !== 1 ||
      snapshot.visibleFaces !== 1 ||
      snapshot.vision?.signals['vision.operator.face'] !== 1)
  )
    return false;

  return snapshot;
}
