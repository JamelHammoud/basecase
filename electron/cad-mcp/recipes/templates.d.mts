import type { SkeletonPayload } from '../../../src/agent/skeleton';

export interface ServoTemplate {
  parts: Array<{ id: string; name: string; code: string; position: number[]; rotation: number[] }>;
  servos: Array<{ id: string; catalog: string; position: number[]; rotation: number[] }>;
  joints: Array<{
    id: string;
    name: string;
    range: [number, number];
    parent: string[];
    child: string[];
    actuators?: string[];
  }>;
}

export interface ArmShape {
  upperArm?: number;
  forearm?: number;
  riser?: number;
  at?: [number, number, number];
  heading?: number;
  servos?: Record<string, string>;
}

export const ARM_SHOULDER_MM: number;
export const ARM_FLANGE: import('three').Vector3;
export const ARM_MASS_G: number;
export const CATALOG_HORN: import('three').Vector3;

export function armTemplate(shape?: ArmShape): ServoTemplate;
export function templateSkeleton(
  template: ServoTemplate,
  opts: { limb: 'arm' | 'leg'; massG: number },
): SkeletonPayload;
export function poseOf(matrix: import('three').Matrix4): { position: number[]; rotation: number[] };
export function bipedTemplate(): ServoTemplate;
export function armSkeleton(): SkeletonPayload;
export function bipedSkeleton(): SkeletonPayload;
