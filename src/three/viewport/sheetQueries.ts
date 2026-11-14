import { cutFilesIn, sheetProfilesIn } from '../analysis/analysisPool';
import type { SceneShapes } from '../analysis/sceneShapes';
import type { Viewport3DHandle } from './types';

export const sheetQueries = (
  restShapes: (ids: string[]) => SceneShapes,
): Pick<Viewport3DHandle, 'sheetProfiles' | 'exportCutFiles'> => ({
  sheetProfiles: (ids) => sheetProfilesIn(restShapes(ids)),
  exportCutFiles: (task) => cutFilesIn(restShapes(task.files.map((f) => f.id)), task),
});
