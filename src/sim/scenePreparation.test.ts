import { expect, it, vi } from 'vitest';
import { selfContactArmInput } from './fixtures/selfContactArm';
import { preparedCalibratedModel, calibratedModel } from './calibratedModel';
import { contactJob } from './contactPreparationClient';
import { prepareContactJob } from './contactPreparation';
import { modelHashes } from '../skills/artifacts';

it('prepares ordinary models through the existing worker and reuses its physical hashes', async () => {
  const input = selfContactArmInput(false);
  const expected = calibratedModel(input, undefined);
  const result = await prepareContactJob(contactJob(input));
  const sent: unknown[] = [];
  const terminated = vi.fn();

  class PreparationWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminate = terminated;
    postMessage(job: unknown) {
      sent.push(job);
      queueMicrotask(() => this.onmessage?.({ data: { result } } as MessageEvent));
    }
  }

  vi.stubGlobal('Worker', PreparationWorker);
  vi.stubGlobal('window', {});

  try {
    const prepared = await preparedCalibratedModel(input, undefined);

    expect(sent).toHaveLength(1);
    expect(prepared).toEqual(expected);
    expect(modelHashes(prepared)).toEqual(modelHashes(expected));
    expect(modelHashes(prepared)).toBe(modelHashes(prepared));
    expect(terminated).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects an ordinary model when the scene changes during worker preparation', async () => {
  const input = selfContactArmInput(false);
  const result = await prepareContactJob(contactJob(input));
  const terminated = vi.fn();
  let current = true;

  class PreparationWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminate = terminated;
    postMessage() {
      current = false;
      queueMicrotask(() => this.onmessage?.({ data: { result } } as MessageEvent));
    }
  }

  vi.stubGlobal('Worker', PreparationWorker);
  vi.stubGlobal('window', {});

  try {
    await expect(preparedCalibratedModel(input, undefined, { current: () => current })).rejects.toThrow(/changed/);
    expect(terminated).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('prepares in the current worker realm even when that realm can create nested workers', async () => {
  const original = selfContactArmInput(false);
  const input = {
    ...original,
    parts: [...original.parts, { ...original.parts[0], id: 'unused-cutout', role: 'cutout' as const }],
    partTriangles: vi.fn(original.partTriangles),
  };
  const spawn = vi.fn(() => {
    throw new Error('Nested preparation worker');
  });

  vi.stubGlobal('window', undefined);
  vi.stubGlobal('Worker', spawn);

  try {
    const prepared = await preparedCalibratedModel(input, undefined);
    const expected = calibratedModel(input, undefined);

    expect(spawn).not.toHaveBeenCalled();
    expect(input.partTriangles).not.toHaveBeenCalledWith('unused-cutout');
    expect(prepared).toEqual(expected);
    expect(modelHashes(prepared)).toEqual(modelHashes(expected));
  } finally {
    vi.unstubAllGlobals();
  }
});

it('invalidates cached hashes when an immutable model field is replaced', () => {
  const model = calibratedModel(selfContactArmInput(false), undefined);
  const hashes = modelHashes(model);

  expect(modelHashes(model)).toBe(hashes);

  const changed = { ...model, xml: model.xml.replace('timestep="0.002"', 'timestep="0.004"') };

  expect(modelHashes(changed).physics).not.toBe(hashes.physics);
  expect(modelHashes(changed).topology).toBe(hashes.topology);
  expect(modelHashes(changed).actuators).toBe(hashes.actuators);
});

it('borrows immutable triangles inside an existing worker while renderer payloads retain transferable copies', async () => {
  const original = selfContactArmInput(false);
  const triangles = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
  const bytes = triangles.slice();
  const input = { ...original, partTriangles: () => triangles };
  const transferable = contactJob(input);

  expect(transferable.triangles.base).toEqual(triangles);
  expect(transferable.triangles.base).not.toBe(triangles);

  const copied = vi.spyOn(triangles, 'slice');

  vi.stubGlobal('window', undefined);

  try {
    const prepared = await preparedCalibratedModel(input, undefined);

    expect(copied).not.toHaveBeenCalled();
    expect(triangles).toEqual(bytes);
    expect(triangles.byteLength).toBe(bytes.byteLength);
    expect(prepared).toEqual(calibratedModel(input, undefined));
  } finally {
    copied.mockRestore();
    vi.unstubAllGlobals();
  }
});
