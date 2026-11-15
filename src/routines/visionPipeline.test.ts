import { createHash } from 'node:crypto';
import loadMujoco from '@mujoco/mujoco';
import { InferenceSession, env } from 'onnxruntime-web/wasm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { fixtureModel, fixtureRobot } from '../skills/fixtureModels';
import { VisionEngine } from '../vision/engine';
import type { VisionManifest } from '../vision/manifest';
import { inputSensitiveDetectionOnnx } from '../vision/onnxFixture';
import { compileRoutine } from './compile';
import { FIXTURE_MODEL_HASH, FIXTURE_SKILLS } from './fixtureSkills';
import { LiveRoutine } from './routineLive';
import { runScenario } from './scenario';
import type { Routine } from './schema';

env.wasm.numThreads = 1;

const vision = new VisionEngine((bytes) => InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
const bytes = inputSensitiveDetectionOnnx();
const manifest: VisionManifest = {
  version: 1,
  id: 'rfdetr-nano',
  kind: 'detect',
  adapter: 'generic',
  classes: ['cup'],
  input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
  model: {
    owner: 'example',
    repo: 'camera-fixture',
    revision: '0'.repeat(40),
    file: 'tiny.onnx',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  },
};
const routine: Routine = {
  schema: 1,
  id: 'cup-wave',
  name: 'Wave at a Cup',
  requires: ['camera', 'legs'],
  safeStop: 'settle',
  base: { kind: 'do', id: 'walk', skill: 'walk', holds: ['body'], timeoutMs: 12000, onTimeout: [], onFail: [] },
  watchers: [
    { id: 'cup', model: 'object-detection', label: 'cup', rateHz: 5, maxAgeMs: 500, publishes: { type: 'boolean' } },
  ],
  reactions: [
    {
      id: 'wave-at-cup',
      when: { fact: 'cup', is: true },
      cooldownMs: 15000,
      onRetrigger: 'ignore',
      body: 'stopFirst',
      steps: [{ kind: 'do', id: 'wave', skill: 'wave', holds: ['body'], timeoutMs: 4000, onTimeout: [], onFail: [] }],
    },
  ],
};

beforeAll(() => vision.load(manifest, bytes));
afterAll(() => vision.close());

it.each([
  { color: 'black', pixel: 0, count: 0 },
  { color: 'white', pixel: 255, count: 1 },
])('uses $color camera pixels instead of opposing mocks in live and L2 Routines', async ({ pixel, count }) => {
  const compiled = compileRoutine(routine, { skills: FIXTURE_SKILLS });

  expect(compiled.ok).toBe(true);

  const plan = compiled.plan!;
  const frame = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(pixel) };
  const scenario = {
    covers: 'camera pixels drive cup-to-wave reactions',
    seconds: 3,
    world: [],
    mocks: { cup: !count },
    faults: [],
    expect: [{ event: 'fired' as const, reaction: 'wave-at-cup', count }],
  };
  const rendered = await runScenario(
    plan,
    { ...scenario, tier: 'L2' },
    {
      render: async () => frame,
      infer: (modelId, pixels) => {
        if (!('data' in pixels)) throw new Error('The fixture supplies pixel arrays.');

        return vision.infer(modelId, pixels, { camera: 'front_camera' });
      },
    },
  );

  expect(rendered.failures).toEqual([]);
  expect(rendered.trace.filter((event) => event.kind === 'opStart' && event.node === 'wave')).toHaveLength(count);

  const mj = await loadMujoco();
  const model = fixtureModel('quad-servo');
  const engine = new SimEngine(mj, model);

  try {
    const live = await LiveRoutine.start(mj, engine, {
      plan,
      scenario,
      joints: fixtureRobot('quad-servo').joints,
      kit: { skills: [...FIXTURE_SKILLS], modelHash: FIXTURE_MODEL_HASH, policies: [], drive: null, problems: {} },
      vision: true,
    });

    live.advance(0.2);
    live.acceptVision(await vision.infer(manifest.id, frame, { camera: 'front_camera' }));

    const update = live.advance(2.5);

    expect(update.events.filter((event) => event.kind === 'fired' && event.reaction === 'wave-at-cup')).toHaveLength(
      count,
    );
    expect(update.events.filter((event) => event.kind === 'opStart' && event.node === 'wave')).toHaveLength(count);
  } finally {
    engine.dispose();
  }
});
