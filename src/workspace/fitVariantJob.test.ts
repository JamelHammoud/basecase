import { afterEach, expect, it, vi } from 'vitest';
import { geometryHandlers } from '../three/geometryOps';
import { generatedFit } from '../print/fitVariants.fixtures';
import { fitBindings } from '../print/fitVariants';
import { fitVariantJob } from './fitVariantJob';
import * as componentMeshes from '../three/componentMeshes';

const live = new Set<PipelineWorker>();
let stalled = false;
const operations: string[] = [];

class PipelineWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;

  constructor() {
    live.add(this);
  }

  postMessage(message: { id: number; op: keyof typeof geometryHandlers; payload: never }) {
    operations.push(message.op);

    if (stalled) return;

    const handler = geometryHandlers[message.op] as (payload: never) => Promise<{ result: unknown }>;

    void Promise.resolve(handler(structuredClone(message.payload))).then((result) => {
      if (live.has(this)) this.onmessage?.({ data: { id: message.id, result: structuredClone(result.result) } });
    });
  }

  terminate() {
    live.delete(this);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  live.clear();
  operations.length = 0;
  stalled = false;
});

it('prepares in one worker, preserves source identities and releases that worker after success', async () => {
  vi.stubGlobal('Worker', PipelineWorker);
  vi.spyOn(componentMeshes, 'sourcedMeshFiles').mockResolvedValue({});

  const design = await generatedFit();
  const result = await fitVariantJob({
    design,
    controller: new AbortController(),
    isCurrent: () => true,
    request: {
      binding: fitBindings(design)[0],
      fit: 'mate',
      values: [21.9, 22, 22.1],
      material: 'PETG',
      down: [1, 0, 0],
    },
  });

  expect(result.source).toBe(design);
  expect(result.parts.map((p) => p.name)).toEqual(['bore = 21.9 mm', 'bore = 22 mm', 'bore = 22.1 mm']);
  expect(operations).toEqual([
    'fitSourceHash',
    'parameterGeometry',
    'fitVariantCoupons',
    'parameterGeometry',
    'fitVariantCoupons',
    'parameterGeometry',
    'fitVariantCoupons',
    'fitComparisonParts',
  ]);
  expect(live.size).toBe(0);
});

it.each(['cancel', 'deadline'] as const)(
  'stops a nonresponding worker after %s without interaction-thread fallback or later candidates',
  async (mode) => {
    vi.stubGlobal('Worker', PipelineWorker);
    stalled = true;

    const design = await generatedFit();

    if (mode === 'deadline') vi.useFakeTimers();

    const controller = new AbortController();
    const pending = fitVariantJob({
      design,
      controller,
      isCurrent: () => true,
      request: {
        binding: fitBindings(design)[0],
        fit: 'mate',
        values: [21.9, 22, 22.1],
        material: 'PETG',
        down: [1, 0, 0],
      },
    });

    expect(live.size).toBe(1);

    const rejected = expect(pending).rejects.toThrow();

    if (mode === 'deadline') await vi.advanceTimersByTimeAsync(30_000);
    else controller.abort();

    await rejected;

    if (mode === 'deadline')
      expect(controller.signal.reason.message).toBe('Fit preparation reached 30 seconds. Prepare fewer values.');

    expect(live.size).toBe(0);
    expect(operations).toEqual(['fitSourceHash']);
  },
);
