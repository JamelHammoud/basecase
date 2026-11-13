import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { runCase, touchTheDots } from '../cases/testing';
import { measureTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { driveAccess } from './driveAccess';
import { SimEngine } from './engine';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import type { SimModel } from './mjcfTypes';
import { recordedEfforts, setRecordedFrame } from './recordedFrames';
import { Recorder, type Recording } from './recorder';

async function armTry(mj: MainModule) {
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const kase = touchTheDots(arm);
  const { model } = await runCase(mj, kase, arm, { controller: 'reference' });
  const rig = buildRig(arm.joints, arm.parts);
  const engine = new SimEngine(mj, model);
  const access = driveAccess({ rig, parts: arm.parts, model });

  if (access.kind !== 'ready') throw new Error(`No scripted drive: ${access.kind}`);

  engine.setController({ kind: 'drive', setup: access.setup });

  const recorder = new Recorder(engine);
  const timeline = [...kase.reference.timeline];

  engine.stepHook = recorder.hook;

  for (let t = 0; t < kase.task.seconds; t += 0.02) {
    while (timeline.length && timeline[0].at <= t + 1e-9)
      engine.command({ v: [0, 0, 0], target: timeline.shift()!.target });

    engine.step(0.02);
  }

  return { model, engine, recording: recorder.finish() };
}

const box = (id: string, y: number, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  massG: 100,
  ...extra,
});

function measuredServoArm(): SimModel {
  const parts = [
    box('base', 300),
    box('servo', 260, { componentId: 'feetech-sts3215', componentVariant: 'c001' }),
    box('link', 180),
  ];
  const joint: RobotJoint = {
    id: 'shoulder',
    name: 'shoulder',
    type: 'revolute',
    parent: ['base', 'servo'],
    child: ['link'],
    origin: [0, 260, 0],
    axis: [1, 0, 0],
    range: [-90, 90],
    actuators: ['servo'],
  };
  const cube = new Float32Array(new THREE.BoxGeometry(20, 20, 20).toNonIndexed().getAttribute('position').array);

  return buildMjcf({
    parts,
    rig: buildRig([joint], parts),
    project: { ...DEFAULT_PROJECT, joints: [joint] },
    measures: Object.fromEntries(parts.map((p) => [p.id, { ...measureTriangles(cube), centroid: p.position }])),
    partTriangles: () => cube,
  });
}

function expectPeaksMatch(mj: MainModule, engine: SimEngine, recording: Recording) {
  const live = engine.stats().joints;
  const scrub = new SimEngine(mj, engine.sim);
  const efforts = recordedEfforts(mj, scrub, recording);

  engine.sim.joints.forEach((j, i) => {
    if (j.actuator < 0) return expect(efforts[i]).toHaveLength(0);

    const peak = efforts[i].reduce((m, v) => Math.max(m, Math.abs(v)), 0) / j.effort;

    expect(efforts[i]).toHaveLength(recording.frames);
    expect(Math.abs(peak - live[i].peak)).toBeLessThanOrEqual(0.02 * live[i].peak);
  });

  expect(live.some((j) => j.peak > 0.05)).toBe(true);
  scrub.dispose();
}

describe('recorded frames', () => {
  it('recomputes each joint’s effort from a recording within 2% of the live Peak torque', async () => {
    const mj = await loadMujoco();
    const { engine, recording } = await armTry(mj);

    expectPeaksMatch(mj, engine, recording);
    engine.dispose();
  });

  it('recomputes a measured servo’s effort through its control delay, between recorded frames', async () => {
    const mj = await loadMujoco();
    const model = measuredServoArm();
    const engine = new SimEngine(mj, model);
    const recorder = new Recorder(engine);

    expect(model.xml).toContain('delay=');
    engine.stepHook = recorder.hook;

    for (const degrees of [3, -2, 6, 1]) {
      engine.setController({ kind: 'hold', values: { shoulder: degrees } });
      engine.step(0.31);
    }

    expectPeaksMatch(mj, engine, recorder.finish());
    engine.dispose();
  });

  it('seeks to frame n with exactly that frame’s qpos and qvel', async () => {
    const mj = await loadMujoco();
    const { model, engine, recording } = await armTry(mj);
    const scrub = new SimEngine(mj, model);
    const { nq, nv } = recording;

    for (const n of [0, 37, recording.frames - 1]) {
      expect(setRecordedFrame(mj, scrub, recording, n)).toBe(n);
      expect(Array.from(scrub.data.qpos)).toEqual(Array.from(recording.qpos.subarray(n * nq, (n + 1) * nq)));
      expect(Array.from(scrub.data.qvel)).toEqual(Array.from(recording.qvel.subarray(n * nv, (n + 1) * nv)));
    }

    expect(setRecordedFrame(mj, scrub, recording, recording.frames + 10)).toBe(recording.frames - 1);
    engine.dispose();
    scrub.dispose();
  });
});
