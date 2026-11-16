import type { StudioPublisher } from '../../electron/fleet/studioPublisher.mjs';

export function attachLoopback(publisher: StudioPublisher): Promise<{ close(): Promise<void> }>;
