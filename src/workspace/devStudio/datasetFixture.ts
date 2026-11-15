import type { StoredTry } from '../../cases/tryFile';
import { sha256 } from '../../cases/tries';
import { segmentLabel } from '../../cases/tryLabels';
import { keepTries } from '../../cases/tryStore';
import type { SimModel } from '../../sim/mjcfTypes';
import type { Recording } from '../../sim/recorder';

const FRAMES = 12;
const RATE = 50;

export async function seedDatasetTry(model: SimModel, sceneId: string, id: string) {
  const joints = model.joints.length;
  const recording: Recording = {
    dt: 1 / RATE,
    frames: FRAMES,
    nq: joints,
    nv: joints,
    nu: joints,
    nbody: model.bodies.length,
    t: Float32Array.from({ length: FRAMES }, (_, frame) => frame / RATE),
    ctrl: Float32Array.from({ length: FRAMES * joints }, (_, i) => Math.floor(i / joints) / 100),
    qpos: Float64Array.from({ length: FRAMES * joints }, (_, i) => Math.floor(i / joints) / 100),
    qvel: new Float32Array(FRAMES * joints),
    poses: new Float32Array(FRAMES * model.bodies.length * 7),
    jointQpos: Int32Array.from({ length: joints }, (_, i) => i),
    jointDof: Int32Array.from({ length: joints }, (_, i) => i),
  };
  const stored: StoredTry = {
    version: 1,
    id,
    sceneId,
    robot: { name: 'Dataset fixture arm', modelHash: await sha256(model.xml), joints: model.joints.map((j) => j.id) },
    case: null,
    source: 'import',
    input: null,
    startedAt: '2026-11-01T00:00:00Z',
    seconds: FRAMES / RATE,
    rate: RATE,
    frames: FRAMES,
    outcome: { verdict: 'passed', margin: 1 },
    seed: 1,
    sourceTry: null,
    faults: [],
    task: 'Move the block',
    labels: {
      by: 'person',
      instruction: 'Original instruction',
      tags: [],
      flags: [],
      segments: [
        { from: 0, to: 6, label: segmentLabel('reach', 'block') },
        { from: 6, to: FRAMES, label: segmentLabel('lift', 'block') },
      ],
    },
  };

  await keepTries([{ stored, recording }]);

  return stored;
}
