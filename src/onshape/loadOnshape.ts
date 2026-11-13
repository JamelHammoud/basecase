import { platformBridge } from '../utils/platformBridge';
import { importRobot, type ImportedRobot } from '../utils/robotImport';
import { withFixedMates } from './fixedMates';
import { onshapeBridge } from './onshapeBridge';

const requestId = () => `onshape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export async function loadOnshape(url: string, say: (message: string) => void): Promise<ImportedRobot> {
  const id = requestId();
  const stop = platformBridge.subscribeEvents((ev) => {
    if (ev.type === 'onshape-progress' && ev.requestId === id) say(String(ev.message));
  });

  try {
    const { model, files } = await onshapeBridge.importAssembly(url, id);
    const robot = await importRobot({ kind: 'converted', url, model, files }, { name: model.name, onProgress: say });

    return { ...robot, parts: withFixedMates(robot.parts, model.fixedMates) };
  } finally {
    stop();
  }
}
