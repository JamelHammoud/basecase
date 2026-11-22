import type { ContactReplay, PhysicsSample } from '../../src/sim/fixtures/contactReplay';

export function nativeContactReplay(
  replay: ContactReplay,
  version: string,
): Promise<{ version: string; cases: PhysicsSample[][] }>;

export function prepareNativeContactReplay(version: string): Promise<void>;

export function closeNativeContactReplays(): Promise<void>;
