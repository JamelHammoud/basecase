import { afterEach, describe, expect, it, vi } from 'vitest';
import { box, fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { studyFingerprint } from './study';
import { createStudySession } from './client';
import type { StudyScene } from './types';

const sceneOf = (massG: number): StudyScene => {
  const part = box('body', [0, 10, 0], [20, 20, 20], massG);

  return {
    parts: [part],
    project: DEFAULT_PROJECT,
    triangles: { body: fixtureTriangles([part])('body')! },
    measures: fixtureMeasures([part]),
  };
};
const options = { knobs: [], selection: [] };

afterEach(() => vi.unstubAllGlobals());

describe('Study worker sessions', () => {
  it('retains registered handles across concurrent jobs and keeps separate studies isolated', async () => {
    const first = createStudySession();
    const second = createStudySession();
    const light = sceneOf(100);
    const heavy = sceneOf(250);
    const [a, b, c] = await Promise.all([
      first.grade(light, options),
      first.grade({ ...light, project: { ...light.project, budgetUsd: 100 } }, options),
      second.grade(heavy, options),
    ]);

    expect([a.massG, b.massG, c.massG]).toEqual([100, 100, 250]);
    first.dispose();
    second.dispose();
    expect(light.triangles.body.byteLength).toBeGreaterThan(0);
    await expect(first.grade(light, options)).rejects.toThrow('stopped');
  });

  it('keeps the source fingerprint when transport packing rounds mesh coordinates', async () => {
    const session = createStudySession();
    const scene = sceneOf(100);
    const source = {
      ...scene,
      parts: scene.parts.map((part) => ({
        ...part,
        kind: 'mesh' as const,
        mesh: {
          positions: [0.123456789, 0, 0, 2, 0, 0, 0, 2, 0],
          indices: [0, 1, 2],
          baseSize: [20, 20, 20] as [number, number, number],
        },
      })),
    };
    const row = await session.grade(source, options);

    expect(row.sceneKey).toBe(studyFingerprint(source.parts, source.project));
    session.dispose();
  });

  it('builds the hold model in the same worker session from cached geometry', async () => {
    const session = createStudySession();
    const scene = sceneOf(120);

    await session.grade(scene, options);

    const { report, model } = await session.hold(scene);

    expect(report.massG).toBe(120);
    expect(model.xml).toContain('mujoco');
    session.dispose();
  });

  it('refuses a browser fallback before running measurements on the main thread', async () => {
    vi.stubGlobal('document', {});

    const session = createStudySession();

    await expect(session.grade(sceneOf(100), options)).rejects.toThrow('start its worker');
    session.dispose();
  });
});
