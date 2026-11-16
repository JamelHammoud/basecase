import type { ContactReplay, PhysicsSample } from '../../src/sim/fixtures/contactReplay';

export function replayDifferences(
  given: Pick<ContactReplay, 'expected'>,
  native: PhysicsSample[],
): { drift: number; contactDifferences: number };
