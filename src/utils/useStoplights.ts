import { useEffect, useState } from 'react';

/**
 * Whether macOS draws its stoplights over the title bar: only in the Electron window on macOS,
 * and not in full screen. The browser and full screen have none, so the title bar starts at the edge.
 */
export function useStoplights(): boolean {
  const api = window.electronAPI;
  const onMac = Boolean(api?.isElectron) && api?.platform === 'darwin';
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!onMac || !api) return;
    let live = true;
    api.isFullScreen().then((value) => live && setFullScreen(value));
    const off = api.onFullScreenChange(setFullScreen);
    return () => {
      live = false;
      off();
    };
  }, [onMac, api]);

  return onMac && !fullScreen;
}
