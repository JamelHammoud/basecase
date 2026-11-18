import { keepTries } from '../../cases/tryStore';
import { sha256 } from '../../cases/tries';
import type { StoredTry } from '../../cases/tryFile';
import type { Recording } from '../../sim/recorder';
import type { Studio } from './types';

export async function keepStudyTry(studio: Studio) {
  const { core } = studio();
  const scene = { parts: core.docs.partsRef.current, project: core.docs.projectRef.current };
  const kase = scene.project.cases![0];
  const stored: StoredTry = {
    version: 1,
    id: 'camera-study-try',
    sceneId: 'camera-study',
    robot: { name: 'Camera rover', modelHash: 'configuration-only', joints: [] },
    case: { id: kase.id, name: kase.name, hash: await sha256(JSON.stringify(kase)) },
    source: 'case',
    input: null,
    startedAt: '2026-11-16T00:00:00.000Z',
    seconds: 1,
    frames: 2,
    rate: 1,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 1,
    sourceTry: null,
    faults: [],
  };
  const recording: Recording = {
    dt: 1,
    frames: 2,
    nq: 0,
    nv: 0,
    nu: 0,
    nbody: 1,
    t: new Float32Array([0, 1]),
    ctrl: new Float32Array(),
    qpos: new Float64Array(),
    qvel: new Float32Array(),
    poses: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
  };

  await keepTries([{ stored, recording }]);
  core.simTraining.cases.open(kase.id);

  return stored.id;
}
