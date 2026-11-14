import type { MainModule } from '@mujoco/mujoco';
import { referenceTry, touchTheDots } from '../cases/testing';
import { sha256 } from '../cases/tries';
import { TRY_FILE_VERSION, type StoredTry } from '../cases/tryFile';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { FixtureRobot } from '../sim/fixtures/parts';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { buildRig } from '../utils/kinematics';
import { sceneModel } from './import/fixtures';
import { kinematicRecording } from './import/kinematicRecording';
import { columnSpans } from './import/units';

export const fixtureArm = (id = 'arm-3dof') => fixtureRobots().find((r) => r.id === id)!;

export interface ArmMotion {
  frames: number;
  fps: number;
  radians: (frame: number, joint: number) => number;
}

export function armReplay(mj: MainModule, model: SimModel, motion: ArmMotion): Recording {
  const width = model.joints.length;
  const state = new Float64Array(motion.frames * width);

  for (let n = 0; n < motion.frames; n++) for (let c = 0; c < width; c++) state[n * width + c] = motion.radians(n, c);

  const episode = {
    index: 0,
    task: null,
    t: Float64Array.from({ length: motion.frames }, (_, n) => n / motion.fps),
    state,
    action: null,
    videos: [],
  };
  const engine = new SimEngine(mj, model);
  const plan = { joints: model.joints.map((j) => j.id), unit: 'rad' as const, spans: columnSpans(state, width) };

  try {
    return kinematicRecording(engine, episode, plan).recording;
  } finally {
    engine.dispose();
  }
}

export async function importedStored(model: SimModel, recording: Recording, id = 'import-touch'): Promise<StoredTry> {
  return {
    version: TRY_FILE_VERSION,
    id,
    sceneId: 'scene-1',
    robot: { name: 'Arm', modelHash: await sha256(model.xml), joints: model.joints.map((j) => j.id) },
    case: null,
    source: 'import',
    input: null,
    startedAt: '2026-11-14T00:00:00.000Z',
    seconds: recording.frames * recording.dt,
    rate: Math.round(1 / recording.dt),
    frames: recording.frames,
    outcome: { verdict: 'unjudged', margin: null },
    seed: 0,
    sourceTry: null,
    faults: [],
    origin: { kind: 'file', name: 'touch.mcap', hash: 'a'.repeat(64) },
    task: 'Touch the dots',
  };
}

function jointColumns(from: SimModel, recording: Recording, to: SimModel) {
  return to.joints.map((j) => recording.jointQpos![from.joints.findIndex((k) => k.id === j.id)]);
}

export async function importedTouch(mj: MainModule, robot: FixtureRobot = fixtureArm()) {
  const kase = touchTheDots(robot);
  const driven = await referenceTry(mj, kase, robot);
  const model = sceneModel([robot]);
  const source = driven.source.recording;
  const columns = jointColumns(driven.source.model, source, model);
  const recording = armReplay(mj, model, {
    frames: source.frames,
    fps: 1 / source.dt,
    radians: (n, c) => source.qpos[n * source.nq + columns[c]],
  });
  const rig = buildRig(robot.joints, robot.parts);

  return { robot, kase, model, rig, recording, stored: await importedStored(model, recording) };
}
