import type { Vector3 } from 'three';
import type { SkeletonPayload } from '../../../src/agent/skeleton';

type Triple = [number, number, number];

export interface ServoTemplate {
  parts: Array<{ id: string; name: string; code: string; position: Triple; rotation: Triple }>;
  servos: Array<{ id: string; catalog: string; position: Triple; rotation: Triple }>;
  joints: Array<{
    id: string;
    name: string;
    range: [number, number];
    parent: string[];
    child: string[];
    actuators: string[];
  }>;
}

export interface ArmOptions {
  links?: Triple;
  baseHeight?: number;
  base?: Triple;
  yaw?: number;
  servos?: string[];
}

export const ARM_MIN_LINK: number;
export const ARM_SHOULDER_Z: number;
export const ARM_TOOL: Vector3;

export function armTemplate(options?: ArmOptions): ServoTemplate & { tool: Triple };
export function bipedTemplate(): ServoTemplate;
export function armSkeleton(options?: ArmOptions): SkeletonPayload;
export function bipedSkeleton(): SkeletonPayload;
