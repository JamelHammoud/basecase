export function eachLimited<T>(
  list: readonly T[],
  limit: number,
  run: (item: T, index: number) => void | Promise<unknown>,
): Promise<void>;
