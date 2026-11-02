import { useEffect } from 'react';
import { finishBoot } from './app/boot';
import { DownloadBanner } from './app/DownloadBanner';
import { useInitialTabs } from './app/openScenes';
import { Studio } from './app/Studio';
import { afterFirstFrame } from './utils/afterFirstFrame';

export function App() {
  const initial = useInitialTabs();

  useEffect(() => {
    if (initial) return afterFirstFrame(finishBoot);
  }, [initial]);

  return (
    <DownloadBanner>
      {initial ? <Studio initial={initial} /> : <div className="window-chrome w-full h-full" />}
    </DownloadBanner>
  );
}

export default App;
