import { measuredRadians, motorsCanRun, type RobotState } from './robotState';
import { robotBenchDriving, robotFaultHeld, robotSceneJoints, robotSnapshot, sendRobotCommand } from './robotStore';

export const MIRROR_EVERY_MS = 25;

const measured = (state: RobotState, k: number): number => measuredRadians(state, state.spec?.ids[k]) ?? 0;

export function intentFromSim(
  state: RobotState,
  joints: readonly string[],
  sim: { ids: readonly string[]; targets: ArrayLike<number> },
): number[] {
  return joints.map((id, k) => {
    const i = sim.ids.indexOf(id);
    const value = i >= 0 ? sim.targets[i] : undefined;

    return value !== undefined && Number.isFinite(value) ? value : measured(state, k);
  });
}

let lastSent = -Infinity;

export function offerSimTargets(ids: readonly string[], targets: ArrayLike<number>) {
  const state = robotSnapshot();
  const joints = robotSceneJoints();

  if (state.link !== 'connected' || !motorsCanRun(state.mode) || !joints || robotBenchDriving() || robotFaultHeld())
    return;

  if (joints.length !== state.spec?.ids.length) return;

  const now = performance.now();

  if (now - lastSent < MIRROR_EVERY_MS) return;

  lastSent = now;
  void sendRobotCommand({ cmd: 'intent', joints: intentFromSim(state, joints, { ids, targets }) });
}
