import { describe, expect, it } from 'vitest';
import { assembleStudio } from './assembleStudio';
import { STUDIO_AREAS } from './studioAreas';
import type { Studio } from './types';

const NAMES_BEFORE_THE_SPLIT = [
  'addCase',
  'agentRequest',
  'attachRobot',
  'bomLines',
  'buildAlongSteps',
  'cadSources',
  'calibrate',
  'calibrationReplay',
  'calibrations',
  'cameraStreams',
  'capture',
  'caseMat',
  'checkDots',
  'clear',
  'codeReports',
  'datasetFiles',
  'datasets',
  'dragPart',
  'dragSkeleton',
  'drive',
  'driveWith',
  'dropFiles',
  'earth',
  'exploreLimit',
  'feedFace',
  'feedHand',
  'feedMatFrames',
  'feedPose',
  'feedVoice',
  'guide',
  'importRobot',
  'inputEvents',
  'interference',
  'labelNotes',
  'lastDownload',
  'load',
  'markPlatePrinted',
  'matTrack',
  'mates',
  'meshByColor',
  'multiplyRuns',
  'operatorCamera',
  'partTriangles',
  'parts',
  'passTries',
  'phone',
  'pickFiles',
  'plantHandoff',
  'plateFiles',
  'pose',
  'poseTool',
  'posedPort',
  'posing',
  'printPlates',
  'printState',
  'project',
  'projectPoints',
  'rangeClashes',
  'readySteps',
  'referenceTry',
  'releaseTrainer',
  'robotCalibration',
  'robotGhost',
  'robotPackage',
  'robotPreview',
  'routineState',
  'runCase',
  'saveMapKey',
  'sceneRecord',
  'select',
  'selectFace',
  'selection',
  'setPose',
  'sharedLink',
  'shownParts',
  'simState',
  'simTool',
  'sketchPath',
  'stlBase64',
  'stubHandoffs',
  'stubTabEngine',
  'stubTrainer',
  'triangleCount',
  'tryWorld',
  'worldAt',
];

const unused: Studio = () => {
  throw new Error('the studio context is read only when a hook runs');
};

describe('__studio', () => {
  it('exposes exactly the names it had before the split into areas', () => {
    expect(Object.keys(assembleStudio(STUDIO_AREAS, unused)).sort()).toEqual(NAMES_BEFORE_THE_SPLIT);
  });

  it('fails when two areas define one name', () => {
    const areas = {
      './areas/scene.ts': () => ({ parts: () => [] }),
      './areas/robot.ts': () => ({ parts: () => [], attachRobot: () => null }),
    };

    expect(() => assembleStudio(areas, unused)).toThrow('__studio.parts is defined in both scene and robot');
  });
});
