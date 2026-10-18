import { useMemo } from 'react';

export function useContentStable<T>(value: T): T {
  const json = JSON.stringify(value);

  return useMemo(() => JSON.parse(json) as T, [json]);
}
