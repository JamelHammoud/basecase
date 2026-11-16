import { afterEach, expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildGuidePlan } from './guidePlan';
import { approximateScene } from './guideScene';
import { generateGuide } from './generateGuide';

const calls = vi.hoisted(() => ({ render: vi.fn(), save: vi.fn() }));

vi.mock('../three/componentMeshes', () => ({ sourcedMeshFiles: async () => ({}) }));
vi.mock('../utils/platformBridge', () => ({ platformBridge: { saveGuide: calls.save } }));
vi.mock('./guidePort', () => ({ renderGuideOnPort: calls.render }));

const parts = [box('bracket', [0, 0, 0], [10, 10, 10], 1)];
const input = { title: 'Kit', parts, project: DEFAULT_PROJECT };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('refuses kit guide rendering on the interaction thread when a worker is unavailable', async () => {
  vi.stubGlobal('Worker', undefined);

  await expect(generateGuide({ ...input, persist: false })).rejects.toThrow('Kit export needs a worker.');
  expect(calls.render).not.toHaveBeenCalled();
  expect(calls.save).not.toHaveBeenCalled();
});

it('keeps normal guide fallback and PDF saving separate from kit worker ownership', async () => {
  const plan = buildGuidePlan(approximateScene(input.title, parts, []), DEFAULT_PROJECT.material);

  calls.render.mockResolvedValue({ html: '<html>Guide</html>', pages: 1, plan, coverDataUrl: '' });
  calls.save.mockResolvedValue({ ok: true });

  const result = await generateGuide(input);

  expect(result?.plan).toEqual(plan);
  expect(result?.saved).toBe(true);
  expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({ html: '<html>Guide</html>' }));
});

it('terminates the export-owned guide worker when preparation is interrupted', async () => {
  const abort = new AbortController();
  const stopped = vi.fn();

  class InterruptingWorker {
    postMessage() {
      abort.abort();
    }

    terminate() {
      stopped();
    }
  }

  vi.stubGlobal('Worker', InterruptingWorker);

  await expect(generateGuide({ ...input, persist: false, signal: abort.signal })).rejects.toThrow();
  expect(stopped).toHaveBeenCalledOnce();
  expect(calls.render).not.toHaveBeenCalled();
  expect(calls.save).not.toHaveBeenCalled();
});
