import { armSkeleton, bipedSkeleton } from '../../electron/cad-mcp/recipes/templates.mjs';
import type { RobotSkeleton } from '../types/skeleton';
import { buildSkeleton, type SkeletonPayload } from './skeleton';

export interface SkeletonTemplate {
  id: 'arm' | 'biped';
  name: string;
  payload: () => SkeletonPayload;
}

export const SKELETON_TEMPLATES: SkeletonTemplate[] = [
  { id: 'arm', name: 'Arm', payload: armSkeleton },
  { id: 'biped', name: 'Biped', payload: bipedSkeleton },
];

export function templateSkeleton(id: SkeletonTemplate['id']): RobotSkeleton {
  const template = SKELETON_TEMPLATES.find((t) => t.id === id)!;

  return buildSkeleton(template.payload()).skeleton;
}
