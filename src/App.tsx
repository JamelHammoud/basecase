import { useInitialTabs } from './app/openScenes';
import { Studio } from './app/Studio';

export function App() {
  const initial = useInitialTabs();

  if (!initial) return <div className="window-chrome w-screen h-screen" />;

  return <Studio initial={initial} />;
}

export default App;
