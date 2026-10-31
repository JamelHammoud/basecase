import { useEffect } from 'react';
import { finishBoot } from './app/boot';
import { useInitialTabs } from './app/openScenes';
import { Studio } from './app/Studio';
import { afterFirstFrame } from './utils/afterFirstFrame';

export function App() {
  const initial = useInitialTabs();

  useEffect(() => {
    if (initial) return afterFirstFrame(finishBoot);
  }, [initial]);

  if (!initial) return <div className="window-chrome w-screen h-screen" />;

  return <Studio initial={initial} />;
}

export default App;
