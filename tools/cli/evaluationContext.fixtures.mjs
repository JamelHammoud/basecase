import * as sceneFile from '../../src/utils/sceneFile';
import * as evaluation from '../../src/cases/evaluation';
import * as sceneCheck from '../../src/cases/sceneCheck';
import * as controller from '../../src/cases/evaluationController';
import * as random from '../../src/cases/caseRandom';
import * as componentMeshes from '../../src/three/componentMeshes';
import * as assets from '../../src/cases/evaluationAssets';
import * as replay from '../../src/cases/evaluationReplay';
import * as recordingValues from '../../src/cases/recordingValues';
import * as execution from '../../src/cases/evaluationExecution';

const modules = {
  'src/utils/sceneFile.ts': sceneFile,
  'src/cases/evaluation.ts': evaluation,
  'src/cases/sceneCheck.ts': sceneCheck,
  'src/cases/evaluationController.ts': controller,
  'src/cases/caseRandom.ts': random,
  'src/three/componentMeshes.ts': componentMeshes,
  'src/cases/evaluationAssets.ts': assets,
  'src/cases/evaluationReplay.ts': replay,
  'src/cases/recordingValues.ts': recordingValues,
  'src/cases/evaluationExecution.ts': execution,
};

export const evaluationContext = { root: process.cwd(), load: async (file) => modules[file] };
