import { EXAMPLES_PER_GESTURE } from '../../cases/gestures';
import type { GestureExample } from './gestureMatch';

export const COUNTDOWN = 3;
export const RECORD_MS = 3000;

export interface TeachSteps {
  wait: (ms: number) => Promise<unknown>;
  record: (ms: number) => Promise<GestureExample | null>;
  live: () => boolean;
  onCount: (n: number) => void;
  onRecording: () => void;
  onTaught: (count: number) => void;
}

async function countedDown(steps: TeachSteps) {
  for (let n = COUNTDOWN; n > 0; n--) {
    if (!steps.live()) return false;

    steps.onCount(n);
    await steps.wait(1000);
  }

  return steps.live();
}

export async function teachExamples(steps: TeachSteps): Promise<GestureExample[] | null> {
  const examples: GestureExample[] = [];

  while (examples.length < EXAMPLES_PER_GESTURE) {
    if (!(await countedDown(steps))) return null;

    steps.onRecording();

    const example = await steps.record(RECORD_MS);

    if (!steps.live()) return null;

    if (example) examples.push(example);

    steps.onTaught(examples.length);
  }

  return examples;
}
