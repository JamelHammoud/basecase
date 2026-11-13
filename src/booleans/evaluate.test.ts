import { afterEach, describe, expect, it, vi } from 'vitest';
import { geometryWorker } from '../three/geometryWorker';
import { packedMesh } from '../three/packedMesh';
import type { ScenePart } from '../types/robotics';
import type { BooleanJob, CsgOutput } from './csg';
import { evaluateBoolean, knownResult } from './evaluate';
import { booleanPart } from './parts';
import { partsWithResults } from './results';

const TETRA = { positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] };

function meshPart(id: string, x: number): ScenePart {
  return {
    id,
    name: id,
    kind: 'mesh',
    category: 'custom_models',
    role: 'solid',
    position: [x, 5, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 10, height: 10, depth: 10 },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
    mesh: { ...TETRA, baseSize: [10, 10, 10] },
  };
}

const reply: CsgOutput = {
  positions: Float64Array.from([0, 0, 0, 4, 0, 0, 0, 4, 0]),
  indices: Uint32Array.from([0, 1, 2]),
  offset: [1, 2, 3],
  size: [4, 4, 1],
  engine: 'manifold',
};

function heldWorker() {
  let answer: (out: CsgOutput | null) => void = () => {};
  const call = vi.spyOn(geometryWorker, 'call').mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve as typeof answer;
      }) as ReturnType<typeof geometryWorker.call>,
  );

  return { call, answer: (out: CsgOutput | null) => answer(out) };
}

const turns = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('boolean hand-off', () => {
  it('cuts only in the geometry worker, handing over the packed meshes it already has', async () => {
    const worker = heldWorker();
    const base = meshPart('base', 0);
    const tool = meshPart('tool', 4);
    let settled = false;
    const pending = evaluateBoolean(booleanPart({ id: 'cut', base, tools: [tool], op: 'subtract' })).then((r) => {
      settled = true;

      return r;
    });

    await turns();

    expect(worker.call).toHaveBeenCalledTimes(1);

    const [op, job] = worker.call.mock.calls[0] as [string, BooleanJob];

    expect(op).toBe('boolean');
    expect(job.operands[0][0].positions).toBe(packedMesh(base.mesh!).positions);
    expect(job.operands[1][0].indices).toBe(packedMesh(tool.mesh!).indices);
    expect(settled).toBe(false);

    worker.answer(reply);

    const result = await pending;

    expect(result).toEqual({
      positions: [0, 0, 0, 4, 0, 0, 0, 4, 0],
      indices: [0, 1, 2],
      offset: [1, 2, 3],
      size: [4, 4, 1],
    });
  });

  it('asks the worker once for the same boolean, then answers from memory', async () => {
    const worker = heldWorker();
    const draft = () =>
      booleanPart({ id: 'cut', base: meshPart('base', 100), tools: [meshPart('tool', 103)], op: 'subtract' });
    const first = evaluateBoolean(draft());
    const second = evaluateBoolean(draft());

    await turns();
    worker.answer(reply);

    expect(await second).toBe(await first);
    expect(await evaluateBoolean(draft())).toBe(await first);
    expect(worker.call).toHaveBeenCalledTimes(1);
  });

  it('applies the reply to the scene without copying its mesh', async () => {
    const worker = heldWorker();
    const draft = () =>
      booleanPart({ id: 'cut', base: meshPart('base', 200), tools: [meshPart('tool', 202)], op: 'subtract' });
    const pending = evaluateBoolean(draft());

    await turns();
    worker.answer(reply);

    const result = (await pending)!;
    const [applied] = partsWithResults([draft()], knownResult);

    expect(applied.mesh!.positions).toBe(result.positions);
    expect(applied.mesh!.indices).toBe(result.indices);
  });
});
