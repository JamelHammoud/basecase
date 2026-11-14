import type { RawInput } from '../sim/inputSources';
import { recordRobotSample, robotSnapshot } from './robotStore';

export const TWIN_EVERY_MS = 100;
export const INPUT_EVERY_MS = 50;

let twinAt = -Infinity;
let inputAt = -Infinity;

const connected = () => robotSnapshot().link === 'connected';

export function feedTwin(angles: Array<number | null>, now = performance.now()) {
  if (!connected() || now - twinAt < TWIN_EVERY_MS) return;

  twinAt = now;
  recordRobotSample({ twin: angles });
}

export function feedInput(read: () => RawInput | null, now = performance.now()) {
  if (!connected() || now - inputAt < INPUT_EVERY_MS) return;

  const input = read();

  if (!input) return;

  inputAt = now;
  recordRobotSample({ input });
}
