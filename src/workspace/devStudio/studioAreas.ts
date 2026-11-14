import type { StudioArea } from './types';

export const STUDIO_AREAS = import.meta.glob(['./areas/*.ts', '!./areas/*.test.ts'], {
  eager: true,
  import: 'default',
}) as Record<string, StudioArea>;
