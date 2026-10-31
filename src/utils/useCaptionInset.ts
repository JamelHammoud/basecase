import { useEffect, useState } from 'react';
import { IS_WINDOWS } from './os';

const WINDOWS_CAPTION_WIDTH = 138;

interface Overlay extends EventTarget {
  visible: boolean;
  getTitlebarAreaRect: () => DOMRect;
}

const overlay = () => (navigator as Navigator & { windowControlsOverlay?: Overlay }).windowControlsOverlay;

function measure(): number {
  const controls = overlay();

  if (!controls) return WINDOWS_CAPTION_WIDTH;

  if (!controls.visible) return 0;

  const area = controls.getTitlebarAreaRect();

  return Math.max(0, window.innerWidth - (area.x + area.width));
}

export function useCaptionInset(): number {
  const native = IS_WINDOWS && Boolean(window.electronAPI?.isElectron);
  const [inset, setInset] = useState(() => (native ? measure() : 0));

  useEffect(() => {
    const controls = overlay();

    if (!native || !controls) return;

    const update = () => setInset(measure());

    controls.addEventListener('geometrychange', update);
    window.addEventListener('resize', update);

    return () => {
      controls.removeEventListener('geometrychange', update);
      window.removeEventListener('resize', update);
    };
  }, [native]);

  return inset;
}
