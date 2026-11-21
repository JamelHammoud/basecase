import type { FingerDimensions, MountDimensions } from '../../src/gripperFingers/types';

export const DEFAULT_MOUNT: MountDimensions;
export const DEFAULT_FINGER: FingerDimensions;
export const MOUNT_BODY: string;
export const FINGER_BODY: string;
export function mountCode(dimensions: MountDimensions): string;
export function fingerCode(dimensions: FingerDimensions): string;
