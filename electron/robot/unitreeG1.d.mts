export const UNITREE_G1: 'unitree-g1';

export const G1_JOINT_NAMES: readonly string[];

export const G1_FIRST_WRITABLE: number;

export function g1JointId(motorIndex: number): number;

export function g1JointName(id: number): string | undefined;

export const G1_WRITABLE_IDS: readonly number[];
