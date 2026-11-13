import { importRobot, type ImportedRobot } from '../utils/robotImport';
import { withFixedMates } from './fixedMates';
import type { OnshapeImport } from './onshapeBridge';
import { withOnshapeIds } from './onshapeIds';
import { onshapeSourceOf } from './onshapeLink';

export async function assemblyRobot(
  url: string,
  { model, files }: OnshapeImport,
  say: (message: string) => void = () => {},
): Promise<ImportedRobot> {
  const source = onshapeSourceOf(url);
  const robot = await importRobot({ kind: 'converted', url, model, files }, { name: model.name, onProgress: say });
  const linked = { ...robot, parts: withFixedMates(robot.parts, model.fixedMates) };

  return source ? withOnshapeIds(linked, model, source) : linked;
}
