import { DEFAULT_UNIT } from '../../electron/robot/units.mjs';

const SCENE_JOINTS_KEY = 'robot-scene-joints';

const HOME_JOINTS_KEY = 'robot-home-joints';

const keyOf = (unit: string, base: string = SCENE_JOINTS_KEY) => (unit === DEFAULT_UNIT ? base : `${base}:${unit}`);

function remember(key: string, joints: string[] | null) {
  try {
    if (joints) sessionStorage.setItem(key, JSON.stringify(joints));
    else sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

export function rememberSceneJoints(unit: string, joints: string[] | null, home: string[] | null = joints) {
  remember(keyOf(unit), joints);
  remember(keyOf(unit, HOME_JOINTS_KEY), home);
}

export const recalledHomeJoints = (unit: string): string[] | null => recalled(keyOf(unit, HOME_JOINTS_KEY));

export const recalledSceneJoints = (unit: string): string[] | null => recalled(keyOf(unit));

function recalled(key: string): string[] | null {
  try {
    const joints: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');

    return Array.isArray(joints) && joints.every((j) => typeof j === 'string') ? joints : null;
  } catch {
    return null;
  }
}
