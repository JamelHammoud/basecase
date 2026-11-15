import { afterEach, describe, expect, it, vi } from 'vitest';
import * as assembly from '../assembly/assemblyGeometry';
import * as collisions from '../three/analysis/collide';
import * as sweeps from '../three/analysis/sweep';
import * as engineering from '../utils/engineering';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { servoArm } from '../sim/fixtures/servoArm';
import { DEFAULT_PROJECT } from '../types/robotics';
import { numbersHash } from '../utils/geometryHash';
import { createStudyGrader, gradeStudyDetached } from './grade';
import { StudyGradeCache } from './gradeCache';
import type { StudyScene } from './types';

const arm = servoArm();
const scene: StudyScene = {
  parts: arm.parts,
  project: { ...DEFAULT_PROJECT, joints: arm.joints },
  measures: fixtureMeasures(arm.parts),
  triangles: Object.fromEntries(arm.parts.map((part) => [part.id, fixtureTriangles(arm.parts)(part.id)!])),
};
const options = { knobs: [], selection: [] };

afterEach(() => vi.restoreAllMocks());

describe('Study geometry grading cache', () => {
  it('reuses exact geometry analysis while engineering regrades each voltage and servo choice', () => {
    const assemblyRun = vi.spyOn(assembly, 'assemblyGeometry');
    const collisionRun = vi.spyOn(collisions, 'collide');
    const sweepRun = vi.spyOn(sweeps, 'sweepClashes');
    const engineeringRun = vi.spyOn(engineering, 'runEngineering');
    const grader = createStudyGrader();
    const first = grader.grade(scene, options);
    const counts = [assemblyRun.mock.calls.length, collisionRun.mock.calls.length, sweepRun.mock.calls.length];
    const changed = {
      ...scene,
      parts: scene.parts.map((part) => (part.componentId ? { ...part, componentVariant: 'c046' } : part)),
      project: { ...scene.project, tether: { volts: 12, amps: 4 } },
      triangles: Object.fromEntries(Object.entries(scene.triangles).map(([id, triangles]) => [id, triangles.slice()])),
    };
    const second = grader.grade(changed, options);

    expect([assemblyRun.mock.calls.length, collisionRun.mock.calls.length, sweepRun.mock.calls.length]).toEqual(counts);
    expect(engineeringRun).toHaveBeenCalledTimes(2);
    expect(second.metrics.worstShare).not.toBe(first.metrics.worstShare);
    expect(second.costUsd).not.toBe(first.costUsd);
    grader.dispose();
  });

  it('invalidates geometry results when a transform changes and matches fresh Checks', () => {
    const assemblyRun = vi.spyOn(assembly, 'assemblyGeometry');
    const grader = createStudyGrader();

    grader.grade(scene, options);

    const changed: StudyScene = {
      ...scene,
      parts: scene.parts.map((part, index) => (index ? part : { ...part, position: [120, 100, 0] })),
    };
    const cached = grader.grade(changed, options);

    expect(assemblyRun).toHaveBeenCalledTimes(2);

    const fresh = gradeStudyDetached(changed, options);

    expect(cached.checks.map(({ check, status, ids }) => ({ check, status, ids }))).toEqual(
      fresh.checks.map(({ check, status, ids }) => ({ check, status, ids })),
    );
    expect(cached.metrics).toEqual(fresh.metrics);
    grader.dispose();
  });

  it('reruns geometry Checks after a shape edit and matches a fresh grade', () => {
    const assemblyRun = vi.spyOn(assembly, 'assemblyGeometry');
    const grader = createStudyGrader();

    grader.grade(scene, options);

    const id = scene.parts[0].id;
    const resized = scene.triangles[id].map((value, index) => (index % 3 === 0 ? value * 1.25 : value));
    const changed = { ...scene, triangles: { ...scene.triangles, [id]: resized } };
    const cached = grader.grade(changed, options);

    expect(assemblyRun).toHaveBeenCalledTimes(2);

    const fresh = gradeStudyDetached(changed, options);

    expect(cached.checks.map(({ check, status, ids }) => ({ check, status, ids }))).toEqual(
      fresh.checks.map(({ check, status, ids }) => ({ check, status, ids })),
    );
    expect(cached.metrics).toEqual(fresh.metrics);
    grader.dispose();
  });

  it('never caches a timed-out assembly run as a completed measurement', () => {
    const original = assembly.assemblyGeometry;
    const assemblyRun = vi
      .spyOn(assembly, 'assemblyGeometry')
      .mockImplementationOnce((...args) => ({ ...original(...args), timedOut: true }));
    const grader = createStudyGrader();
    const partial = grader.grade(scene, options);
    const complete = grader.grade(scene, options);

    grader.grade(scene, options);

    expect(partial.checks.find((check) => check.check === 'Checks')?.status).toBe('fail');
    expect(complete.checks.some((check) => check.check === 'Checks')).toBe(false);
    expect(assemblyRun).toHaveBeenCalledTimes(2);
    grader.dispose();
  });

  it('verifies actual triangle equality when the coarse geometry hash collides', () => {
    const cache = new StudyGradeCache();
    const first = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const changed = first.slice();

    changed[0] = 0.000001;
    expect(numbersHash(first)).toBe(numbersHash(changed));
    expect(cache.solid(first)).not.toBe(cache.solid(changed));
    expect(cache.solid(first.slice())).toBe(cache.solid(first));
    cache.dispose();
  });
});
