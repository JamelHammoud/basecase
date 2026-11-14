import { describe, expect, it } from 'vitest';
import { renderMatFrame } from '../cameras/mat/matFrames';
import type { CaseMat } from '../cases/mat/matLayout';
import { VisionEngine } from '../vision/engine';
import { TEST_VISION_MANIFEST, testVisionModel } from '../vision/testModel';
import { compileRoutine } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';
import type { Routine } from './schema';
import { runVisionScenario } from './visionScenario';

const mat: CaseMat = {
  caseId: 'vision',
  paper: 'a4',
  tags: [],
  sheets: [{ column: 0, row: 0, x0: -10000, z0: -10000, width: 20000, height: 20000 }],
  base: { id: 0, size: 60, center: [0, 0, 0], up: [0, 1] },
  start: { center: [0, 0], width: 100, depth: 100, up: [0, 1] },
  spots: [],
  path: [],
  outlines: [],
};

function renderedFrame() {
  const gray = renderMatFrame({
    mat,
    width: 8,
    height: 8,
    base: null,
    camera: { position: [0, 100, 100], target: [0, 0, 0], lens: { model: 'pinhole', hfovDeg: 60 } },
  });
  const data = new Uint8ClampedArray(gray.length * 4);

  gray.forEach((value, i) => data.set([value, value, value, 255], i * 4));

  return { width: 8, height: 8, data };
}

const routine = (): Routine => ({
  schema: 1,
  id: 'vision',
  name: 'See a cup',
  requires: ['camera', 'legs', 'speaker'],
  safeStop: 'settle',
  base: { kind: 'do', id: 'base', skill: 'settle', holds: ['body'], timeoutMs: 3000, onTimeout: [], onFail: [] },
  watchers: [
    {
      id: 'cup',
      model: 'object-detection',
      camera: 'scene',
      className: 'cup',
      rateHz: 10,
      maxAgeMs: 500,
      publishes: { type: 'boolean' },
    },
  ],
  reactions: [
    {
      id: 'noticed',
      when: { fact: 'cup', is: true },
      cooldownMs: 1000,
      onRetrigger: 'ignore',
      body: 'stopFirst',
      steps: [
        {
          kind: 'infer',
          id: 'checkCup',
          model: 'object-detection',
          input: 'camera',
          camera: 'scene',
          className: 'cup',
          output: { type: 'boolean' },
          timeoutMs: 1000,
          onTimeout: [],
          onFail: [],
        },
        { kind: 'do', id: 'wave', skill: 'wave', holds: ['body'], timeoutMs: 2000, onTimeout: [], onFail: [] },
        { kind: 'say', id: 'greet', text: 'Hello cup', timeoutMs: 1000, onTimeout: [], onFail: [] },
      ],
    },
  ],
});

describe('L2 rendered camera perception', { timeout: 30000 }, () => {
  it('runs camera pixels through ONNX and the real coordinator, ignoring L0 mocks and unrelated classes', async () => {
    const compiled = compileRoutine(routine(), { skills: FIXTURE_SKILLS });

    expect(compiled.ok).toBe(true);

    if (!compiled.ok) throw new Error('Compile the camera fixture.');

    const engine = new VisionEngine();
    const scenario = {
      covers: 'camera',
      seconds: 2.4,
      world: [{ at: 0, fact: 'cup', value: true }],
      mocks: { cup: true },
      faults: [],
      expect: [],
    };
    const input = { engine, renderFrame: renderedFrame };

    try {
      await engine.load({ ...TEST_VISION_MANIFEST, id: 'object-detection', classes: ['cup'] }, testVisionModel(), {
        backend: 'wasm',
      });

      const seen = await runVisionScenario(compiled.plan, scenario, input);

      expect(seen.passed).toBe(true);
      expect(seen.said).toEqual(['Hello cup']);
      expect(seen.trace).toContainEqual(expect.objectContaining({ kind: 'control', skill: 'wave' }));
      expect(seen.trace).toContainEqual(expect.objectContaining({ kind: 'result', node: 'checkCup', value: 1 }));
      await engine.load({ ...TEST_VISION_MANIFEST, id: 'object-detection', classes: ['bottle'] }, testVisionModel(), {
        backend: 'wasm',
      });

      const unrelated = await runVisionScenario(compiled.plan, scenario, input);

      expect(unrelated.passed).toBe(true);
      expect(unrelated.said).toEqual([]);
    } finally {
      await engine.dispose();
    }
  });
});
