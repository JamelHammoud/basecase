import type { MoveReference } from './environment';

export function moveReward(reference: MoveReference): string {
  const n = reference.joints.length;

  return `
def fell(state):
    return -state.gravity[2] < 0.5 or state.z < 0.45 * state.z0

def reward(state):
    scale = state.control_dt * 10
    pose_error = sum((state.joint_pos - state.reference[:${n}]) ** 2) / ${n}
    lean = (-state.gravity[2] - cos(state.reference[${n + 1}])) ** 2
    sink = (state.z - state.reference[${n}]) / (0.1 * max(state.z0, 0.05))
    return (
        term("track", 2.0 * exp(-pose_error / 0.04) * scale)
        + term("track_fine", 1.0 * exp(-pose_error / 0.005) * scale)
        + term("upright", 0.5 * exp(-lean / 0.02) * scale)
        + term("height", 0.3 * exp(-sink ** 2) * scale)
        - term("smooth", 0.05 * sum((state.action - state.last_action) ** 2) * scale)
        - term("wobble", 0.02 * sum(state.angvel[:2] ** 2) * scale)
        - term("drift", 0.5 * (state.linvel[0] ** 2 + state.linvel[1] ** 2) * scale)
        - term("fall", 2.0 if fell(state) else 0.0)
    )
`;
}
