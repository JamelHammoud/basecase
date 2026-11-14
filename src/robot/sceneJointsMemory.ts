import { DEFAULT_UNIT } from '../../electron/robot/units.mjs';

const SCENE_JOINTS_KEY = 'robot-scene-joints';

const keyOf = (unit: string) => (unit === DEFAULT_UNIT ? SCENE_JOINTS_KEY : `${SCENE_JOINTS_KEY}:${unit}`);

export function rememberSceneJoints(unit: string, joints: string[] | null) {
  try {
    if (joints) sessionStorage.setItem(keyOf(unit), JSON.stringify(joints));
    else sessionStorage.removeItem(keyOf(unit));
  } catch {
    return;
  }
}

export function recalledSceneJoints(unit: string): string[] | null {
  try {
    const joints: unknown = JSON.parse(sessionStorage.getItem(keyOf(unit)) ?? 'null');

    return Array.isArray(joints) && joints.every((j) => typeof j === 'string') ? joints : null;
  } catch {
    return null;
  }
}
