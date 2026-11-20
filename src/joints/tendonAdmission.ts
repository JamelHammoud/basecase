export const TENDON_SIM_ONLY = 'Use Simulate for ideal tendons.';

export function requireNoTendons(joints: readonly { tendon?: unknown }[]) {
  if (joints.some((joint) => joint.tendon)) throw new Error(TENDON_SIM_ONLY);
}
