import { describe, expect, it } from 'vitest';
import { saluteMotion } from './fixtures/gestures';
import type { GestureExample } from './gestureMatch';
import { exampleFrom, recognize } from './gestureRecognizer';
import { RECORD_MS, teachExamples, type TeachSteps } from './teachExamples';

function teaching(recordings: Array<GestureExample | null>, options: { stopAfter?: number } = {}) {
  const log: string[] = [];
  let live = true;
  let taken = 0;

  const steps: TeachSteps = {
    wait: async (ms) => {
      log.push(`wait ${ms}`);
    },
    record: async (ms) => {
      log.push(`record ${ms}`);

      const example = recordings[taken++] ?? null;

      if (taken === options.stopAfter) live = false;

      return example;
    },
    live: () => live,
    onCount: (n) => log.push(`count ${n}`),
    onRecording: () => log.push('recording'),
    onTaught: (n) => log.push(`taught ${n}`),
  };

  return { log, run: () => teachExamples(steps) };
}

const salutes = [0, 1, 2].map((v) => exampleFrom(saluteMotion(v))!);
const round = (taught: number) =>
  ['count 3', 'wait 1000', 'count 2', 'wait 1000', 'count 1', 'wait 1000'].concat([
    'recording',
    `record ${RECORD_MS}`,
    `taught ${taught}`,
  ]);

describe('teaching a gesture', () => {
  it('counts down from 3 before each of three recordings, and the taught gesture fires on a fourth try', async () => {
    const { log, run } = teaching(salutes);
    const examples = await run();

    expect(log).toEqual([...round(1), ...round(2), ...round(3)]);
    expect(examples).toEqual(salutes);
    expect(recognize(saluteMotion(3), [{ name: 'salute', examples: examples! }]).map((g) => g.name)).toEqual([
      'salute',
    ]);
  });

  it('takes a recording where nothing moved again', async () => {
    const { log, run } = teaching([salutes[0], null, salutes[1], salutes[2]]);

    expect(await run()).toEqual(salutes);
    expect(log).toEqual([...round(1), ...round(1), ...round(2), ...round(3)]);
  });

  it('stops without a gesture when the sheet closes during a recording', async () => {
    const { log, run } = teaching(salutes, { stopAfter: 2 });

    expect(await run()).toBeNull();
    expect(log).toEqual([...round(1), ...round(2).slice(0, -1)]);
  });
});
