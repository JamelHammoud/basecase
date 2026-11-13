import type { ConsoleSignal } from '../../../cases/console/format';
import type { SignalValue } from '../../../cases/console/signalBus';
import { fmtTime } from '../../simulate/format';

export function signalText(id: string, value: SignalValue | undefined, signals: readonly ConsoleSignal[]): string {
  if (value === undefined) return '';

  if (Array.isArray(value)) return value.join(', ');

  const def = signals.find((s) => s.id === id);

  if (def?.kind === 'timer' || id === 'time') return fmtTime(value);

  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) >= 100 ? 0 : 2);
}
