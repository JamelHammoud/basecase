import type { ConsoleSignal } from '../../../cases/console/format';
import type { SignalValue } from '../../../cases/console/signalBus';
import { runClock } from '../../../utils/duration';
import { negative } from '../../../../electron/minus.mjs';

const figures = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(v >= 100 ? 0 : 2));

export function signalText(id: string, value: SignalValue | undefined, signals: readonly ConsoleSignal[]): string {
  if (value === undefined) return '';

  if (Array.isArray(value)) return value.join(', ');

  const def = signals.find((s) => s.id === id);

  if (def?.kind === 'timer' || id === 'time') return runClock(value);

  return negative(value, figures);
}
