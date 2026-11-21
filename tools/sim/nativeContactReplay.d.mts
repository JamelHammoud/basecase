import type { ContactReplay, PhysicsSample } from '../../src/sim/fixtures/contactReplay';

export function nativeContactReplay(
  replay: ContactReplay,
  version: string,
): Promise<{ version: string; cases: PhysicsSample[][] }>;
