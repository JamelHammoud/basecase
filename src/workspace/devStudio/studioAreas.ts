import type { StudioArea } from './types';

export const STUDIO_AREAS = import.meta.glob<StudioArea>(['./areas/*.ts', '!./areas/*.test.ts'], {
  eager: true,
  import: 'default',
});
