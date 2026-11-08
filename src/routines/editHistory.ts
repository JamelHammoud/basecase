export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 100;

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) return history;

  return { past: [...history.past.slice(-(HISTORY_LIMIT - 1)), history.present], present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);

  if (previous === undefined) return history;

  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;

  if (next === undefined) return history;

  return { past: [...history.past, history.present], present: next, future: rest };
}
