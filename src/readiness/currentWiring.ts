import type { Readiness } from './types';

export function currentWiring(readiness: { current: Readiness | null; fingerprint: string }) {
  return readiness.current?.fingerprint === readiness.fingerprint ? readiness.current.wiring : undefined;
}
