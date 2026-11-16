import loadMujoco from '@mujoco/mujoco';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { closedLinkage, closedLinkages } from './fixtures/closedLinkages';
import { SimEngine } from './engine';
import { simDelta } from './mjcfFrames';
import { buildRig } from '../utils/kinematics';
import { posedPort } from '../utils/posedPort';
import { buildMjcf } from './mjcf';
import { trainingJob } from './trainingJob';
import { encodeRecording, decodeRecording } from '../cases/recordingFile';
import { Recorder } from './recorder';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

function portAt(engine: SimEngine, id: string, port: string) {
  const part = engine.sim.bodies.flatMap((b) => b.parts).includes(id);

  expect(part).toBe(true);

  const scene = closedParts.get(engine)!;
  const p = scene.find((p) => p.id === id)!;
  const at = posedPort(buildRig([], scene), { values: {} }, { part: p, port })!;

  return new THREE.Vector3(...at).applyMatrix4(simDelta(engine.sim, engine.poses(), id)!);
}

const closedParts = new WeakMap<SimEngine, ReturnType<typeof closedLinkage>['input']['parts']>();

describe('Sketch four-bars in production MuJoCo', () => {
  it.each(closedLinkages)('$name closes under load with one action per crank', (spec) => {
    const { input, model, builds } = closedLinkage(spec);
    const engine = new SimEngine(mj, model);

    closedParts.set(engine, input.parts);

    try {
      expect(engine.model.neq).toBe(builds.length);
      expect(engine.model.nu).toBe(builds.length);
      expect(engine.model.nv).toBe(3 * builds.length + (spec.floating ? 6 : 0));
      expect(model.joints.filter((j) => j.actuator < 0)).toHaveLength(2 * builds.length);
      expect(model.joints.filter((j) => j.actuator >= 0).every((j) => j.dynamics === 'measured')).toBe(true);

      const job = trainingJob(
        model,
        model.robots[0].key,
        { task: 'stand', minutes: 1, command: [0, 0, 0] },
        'Four-bar',
      );

      expect(job.joints).toHaveLength(builds.length);
      expect(job.ctrlDefault).toHaveLength(builds.length);
      expect(Object.keys(job.initialJoints)).toHaveLength(3 * builds.length);
      expect(Array.from(engine.model.body_mass as Float64Array).reduce((sum, v) => sum + v, 0)).toBeGreaterThan(0.05);
      expect(model.massKg[model.robots[0].key]).toBeGreaterThan(0.05);

      const recorder = new Recorder(engine);
      const start = engine.data.qpos.slice();

      for (let step = 0; step < 80; step++) {
        engine.setController({ kind: 'hold', values: Object.fromEntries(builds.map((b) => [b.crankJoint, step / 4])) });
        engine.step(0.02, recorder.hook);

        checkMotion({ engine, input, builds, floating: spec.floating });
      }

      expect(Array.from(engine.data.qpos as Float64Array).some((v, i) => Math.abs(v - start[i]) > 0.02)).toBe(true);

      const saved = recorder.finish();
      const recording = decodeRecording(encodeRecording(saved))!;

      expect(encodeRecording(recording)).toEqual(encodeRecording(saved));

      expect(recording.nu).toBe(builds.length);
      expect(recording.nv).toBe(engine.model.nv);

      for (let i = 0; i < recording.frames; i++) {
        engine.setState(recording.qpos.subarray(i * recording.nq, (i + 1) * recording.nq));

        const poses = engine.poses();

        poses.forEach((v, k) => expect(v).toBeCloseTo(recording.poses[i * poses.length + k], 5));
      }

      engine.reset();
      expect(Array.from(engine.data.qpos)).toEqual(Array.from(start));
    } finally {
      engine.dispose();
    }
  });

  it('refuses missing closure partners, broken frames and impossible geometry', () => {
    const { input } = closedLinkage();
    const altered = [
      input.project.joints.slice(0, 2),
      input.project.joints.map((j) =>
        j.loop ? { ...j, loop: { ...j.loop, fourBar: { ...j.loop.fourBar, theta: Number.NaN } } } : j,
      ),
      input.project.joints.map((j) => (j.loop ? { ...j, axis: [Number.NaN, 0, 1] as [number, number, number] } : j)),
      input.project.joints.map((j) => (j.loop ? { ...j, loop: { ...j.loop, driver: 'missing' } } : j)),
      input.project.joints.map((j) =>
        j.loop ? { ...j, loop: { ...j.loop, fourBar: { ...j.loop.fourBar, coupler: 1 } } } : j,
      ),
      input.project.joints.map((j) =>
        j.loop?.link === 'rocker' ? { ...j, origin: [999, 0, 0] as [number, number, number] } : j,
      ),
    ];

    for (const joints of altered)
      expect(() => buildMjcf({ ...input, rig: buildRig(joints, input.parts) })).toThrow(/four-bar/i);
  });
});

function checkMotion({
  engine,
  input,
  builds,
  floating,
}: {
  engine: SimEngine;
  input: ReturnType<typeof closedLinkage>['input'];
  builds: ReturnType<typeof closedLinkage>['builds'];
  floating?: boolean;
}) {
  for (const b of builds) {
    expect(
      portAt(engine, b.coupler, 'C').distanceTo(portAt(engine, b.coupler.replace('coupler', 'rocker'), 'C')),
    ).toBeLessThan(0.15);

    const value = (engine.jointAngles()[engine.sim.joints.findIndex((j) => j.id === b.crankJoint)] * 180) / Math.PI;
    const p = input.parts.find((p) => p.id === b.coupler)!;
    const cad = posedPort(input.rig, { values: { [b.crankJoint]: value } }, { part: p, port: 'P' })!;

    const root = floating ? simDelta(engine.sim, engine.poses(), b.coupler.replace('coupler', 'ground')) : null;
    const expected = new THREE.Vector3(...cad).applyMatrix4(root ?? new THREE.Matrix4());

    expect(portAt(engine, b.coupler, 'P').distanceTo(expected)).toBeLessThan(0.3);
  }
}
