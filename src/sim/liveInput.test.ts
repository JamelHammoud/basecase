import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveCommand } from './driveTypes';
import { liveInput, readInputs, registerInputSource } from './inputSources';
import type { InputMoment } from './inputTypes';

const still: DriveCommand = { v: [0, 0, 0] };
const moment: InputMoment = { cls: 'arm', keys: still };
let now = 1000;
let rawA: number[] | null = [1, 2, 3];
let commandA: DriveCommand | null = still;

registerInputSource({ id: 'test-a', read: () => commandA, raw: () => rawA });
registerInputSource({ id: 'test-b', read: () => ({ v: [0.5, 0, 0], aux: [0, 1], joints: { elbow: 0.25 } }) });
registerInputSource({ id: 'test-long', read: () => still, raw: () => Array.from({ length: 2000 }, (_, i) => i) });

beforeEach(() => {
  now = 1000;
  rawA = [1, 2, 3];
  commandA = still;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => vi.restoreAllMocks());

describe('liveInput', () => {
  it('names the source readInputs picked as moving, with its raw values', () => {
    commandA = { v: [1, 0, 0] };
    readInputs(['test-a', 'test-b'], moment);

    expect(liveInput()).toEqual({ id: 'test-a', values: [1, 2, 3] });
  });

  it('falls back to the moving command’s numbers when the source has no raw values', () => {
    readInputs(['test-a', 'test-b'], moment);

    expect(liveInput()).toEqual({ id: 'test-b', values: [0.5, 0, 0, 0, 1, 0.25] });
  });

  it('takes the last source when none moves, and its command when its raw values are missing', () => {
    rawA = null;
    readInputs(['test-b', 'test-a'], { ...moment, keys: still });

    expect(liveInput()).toEqual({ id: 'test-b', values: [0.5, 0, 0, 0, 1, 0.25] });

    readInputs(['test-a'], moment);

    expect(liveInput()).toEqual({ id: 'test-a', values: [0, 0, 0] });
  });

  it('is null once readInputs hasn’t run for 500 ms', () => {
    readInputs(['test-a'], moment);
    now += 500;

    expect(liveInput()?.id).toBe('test-a');

    now += 1;

    expect(liveInput()).toBeNull();
  });

  it('is null after a read with no inputs', () => {
    readInputs([], moment);

    expect(liveInput()).toBeNull();
  });

  it('keeps at most 512 values', () => {
    readInputs(['test-long'], moment);

    const values = liveInput()?.values ?? [];

    expect(values).toHaveLength(512);
    expect(values.at(-1)).toBe(511);
  });
});
