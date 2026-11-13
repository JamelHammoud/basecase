import type { SkeletonPayload } from '../../../src/agent/skeleton';

export interface ServoTemplate {
  parts: Array<{ id: string; name: string; code: string; position: number[]; rotation: number[] }>;
  servos: Array<{ id: string; catalog: string; position: number[]; rotation: number[] }>;
  joints: Array<{ id: string; name: string; range: [number, number]; parent: string[]; child: string[] }>;
}

export function armTemplate(): ServoTemplate;
export function bipedTemplate(): ServoTemplate;
export function armSkeleton(): SkeletonPayload;
export function bipedSkeleton(): SkeletonPayload;
