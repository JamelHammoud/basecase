import type { StoredTry } from '../src/cases/tryFile';
import {
  graspMotion,
  storedTry,
  walkMotion,
  waveMotion,
  type TrySpec,
} from '../src/cases/trySearch/fixtures/searchFixtures';

const pick = (id: string, sceneId: string, verdict: TrySpec['verdict']): TrySpec => ({
  id,
  sceneId,
  robot: 'SO-101',
  caseName: 'Grasp the Red Block',
  input: 'leader-arm',
  verdict,
});

const lift = (id: string, sceneId: string, motion: TrySpec['motion']): TrySpec => ({
  id,
  sceneId,
  robot: 'Arm',
  caseName: 'Lift',
  input: null,
  motion,
});

const SEARCH_FIXTURES: TrySpec[] = [
  pick('pick-failed-1', 'scene-a', 'failed'),
  pick('pick-failed-2', 'scene-b', 'failed'),
  pick('pick-passed', 'scene-a', 'passed'),
  lift('grasp-1', 'scene-a', graspMotion()),
  lift('grasp-2', 'scene-a', graspMotion(1.03, 0.01)),
  lift('grasp-3', 'scene-b', graspMotion(0.93, 0.02)),
  lift('grasp-4', 'scene-b', graspMotion(1.07)),
  { id: 'wave', sceneId: 'scene-a', robot: 'Arm', caseName: 'Wave', input: null, motion: waveMotion() },
  {
    id: 'walk',
    sceneId: 'scene-b',
    robot: 'Hexapod',
    caseName: 'Walk',
    input: null,
    seconds: 40,
    motion: walkMotion(),
  },
];

export const searchTries = (): StoredTry[] =>
  SEARCH_FIXTURES.map((spec) => ({ ...storedTry(spec), startedAt: new Date().toISOString() }));
