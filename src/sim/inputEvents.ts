import type { FactValue } from '../cases/caseFacts';

export interface InputEvent {
  name: string;
  value: FactValue;
  at: number;
}

const KEPT = 64;

const listeners = new Set<(event: InputEvent) => void>();
let recent: InputEvent[] = [];

export function emitInputEvent(name: string, value: FactValue = true) {
  const event: InputEvent = { name, value, at: performance.now() };

  recent = [...recent.slice(1 - KEPT), event];
  listeners.forEach((listen) => listen(event));
}

export function onInputEvent(listen: (event: InputEvent) => void) {
  listeners.add(listen);

  return () => {
    listeners.delete(listen);
  };
}

export const recentInputEvents = (): readonly InputEvent[] => recent;
