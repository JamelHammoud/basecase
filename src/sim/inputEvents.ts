import type { FactValue } from '../cases/caseFacts';

export interface InputEvent {
  at: number;
  name: string;
  value: FactValue;
}

const KEPT = 200;
const log: InputEvent[] = [];
const listeners = new Set<(event: InputEvent) => void>();

export function emitInputEvent(name: string, value: FactValue = true) {
  const event = { at: performance.now(), name, value };

  log.push(event);

  if (log.length > KEPT) log.shift();

  for (const listener of listeners) listener(event);
}

export function onInputEvent(listener: (event: InputEvent) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export const inputEvents = (): InputEvent[] => [...log];

export function lastInputEvent(name: string, value: FactValue): number | null {
  for (let i = log.length - 1; i >= 0; i--) if (log[i].name === name && log[i].value === value) return log[i].at;

  return null;
}
