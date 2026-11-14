import { useEffect, useRef, useState } from 'react';
import { recordGestureExample } from '../../cameras/operator/operatorCamera';
import type { GestureExample } from '../../cameras/gestures/gestureMatch';
import { EXAMPLES_PER_GESTURE, type CaseGesture } from '../../cases/gestures';

export const COUNTDOWN = 3;
export const RECORD_MS = 3000;

export type TeachPhase = 'name' | 'countdown' | 'recording';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useTeachGesture(onTaught: (gesture: CaseGesture) => void) {
  const [phase, setPhase] = useState<TeachPhase>('name');
  const [count, setCount] = useState(COUNTDOWN);
  const [taught, setTaught] = useState(0);
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );

  const countDown = async (mine: number) => {
    setPhase('countdown');

    for (let n = COUNTDOWN; n > 0; n--) {
      if (run.current !== mine) return false;

      setCount(n);
      await wait(1000);
    }

    return run.current === mine;
  };

  const start = async (name: string) => {
    const mine = ++run.current;
    const examples: GestureExample[] = [];

    while (examples.length < EXAMPLES_PER_GESTURE) {
      if (!(await countDown(mine))) return;

      setPhase('recording');

      const example = await recordGestureExample(RECORD_MS);

      if (run.current !== mine) return;

      if (example) examples.push(example);

      setTaught(examples.length);
    }

    onTaught({ name, examples });
  };

  return { phase, count, taught, start: (name: string) => void start(name) };
}
