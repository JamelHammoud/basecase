import { platformBridge } from '../utils/platformBridge';
import type { ImportedRobot } from '../utils/robotImport';
import { assemblyRobot } from './assemblyRobot';
import { onshapeBridge } from './onshapeBridge';

const requestId = () => `onshape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export async function loadOnshape(url: string, say: (message: string) => void): Promise<ImportedRobot> {
  const id = requestId();
  const stop = platformBridge.subscribeEvents((ev) => {
    if (ev.type === 'onshape-progress' && ev.requestId === id) say(String(ev.message));
  });

  try {
    return await assemblyRobot(url, await onshapeBridge.importAssembly(url, id), say);
  } finally {
    stop();
  }
}
