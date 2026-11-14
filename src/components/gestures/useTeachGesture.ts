import { useEffect, useRef, useState } from 'react';
import { recordGestureExample } from '../../cameras/operator/operatorCamera';
import { COUNTDOWN, teachExamples } from '../../cameras/gestures/teachExamples';
import type { CaseGesture } from '../../cases/gestures';

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

  const start = async (name: string) => {
    const mine = ++run.current;
    const examples = await teachExamples({
      wait,
      record: recordGestureExample,
      live: () => run.current === mine,
      onCount: (n) => {
        setPhase('countdown');
        setCount(n);
      },
      onRecording: () => setPhase('recording'),
      onTaught: setTaught,
    });

    if (examples) onTaught({ name, examples });
  };

  return { phase, count, taught, start: (name: string) => void start(name) };
}
