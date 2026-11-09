import type { SimModel } from '../sim/mjcfTypes';
import type { RobotPoseState } from '../types/robotics';

export type V3 = [number, number, number];

export interface KitRobot {
  key: string;
  root: string;
  floating: boolean;
  joints: string[];
}

const D2R = Math.PI / 180;

export const KIT_ACTION_SCALE = 0.5;

const STRUCTURE = /<body\b[^>]*?\bname="([^"]*)"[^>]*?(\/?)>|<\/body>/g;
const LEGGED_SPEED = 0.2;
const TWO_LEGGED_SPEED = 0.15;

export function kitRobot(model: SimModel): KitRobot {
  const robot = model.robots[0];

  if (!robot) throw new Error('The Motor Kit needs a robot with joints.');

  const joints = model.joints.filter((j) => j.robot === robot.key && j.actuator >= 0 && j.drive === 'position');

  return { key: robot.key, root: robot.root, floating: robot.floating, joints: joints.map((j) => j.id) };
}

function escaped(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rootHeight(model: SimModel): number {
  const { key, root } = kitRobot(model);
  const at = new RegExp(`<body\\b[^>]*\\bname="${escaped(root)}"[^>]*\\bpos="([^"]*)"`).exec(model.xml);
  const z = Number(at?.[1].trim().split(/\s+/)[2] ?? NaN);

  if (!Number.isFinite(z)) throw new Error(`The model has no start height for ${root}.`);

  return z + (model.initial.roots?.[key]?.position?.[1] ?? 0) / 1000;
}

export function footCount(model: SimModel): number {
  const { root } = kitRobot(model);
  const tokens = [...model.xml.matchAll(STRUCTURE)].map(([whole, name, closed]) => ({
    open: !whole.startsWith('</'),
    name,
    closed: closed === '/',
  }));
  const start = tokens.findIndex((t) => t.open && t.name === root);
  let depth = 0;
  let feet = 0;

  for (let i = start + 1; i < tokens.length && depth >= 0; i++) {
    const t = tokens[i];

    if (t.open && (t.closed || tokens[i + 1]?.open === false)) feet += 1;

    if (t.open && !t.closed) depth += 1;

    if (!t.open) depth -= 1;
  }

  return feet;
}

export const kitTopSpeed = (model: SimModel) => (footCount(model) >= 4 ? LEGGED_SPEED : TWO_LEGGED_SPEED);

export const neutralRad = (model: SimModel, id: string) => (model.initial.values[id] ?? 0) * D2R;

export function offsetPose(model: SimModel, degrees: number): RobotPoseState {
  const values = { ...model.initial.values };

  kitRobot(model).joints.forEach((id, i) => {
    values[id] = (values[id] ?? 0) + (i % 2 ? -1 : 1) * degrees;
  });

  return { ...model.initial, values };
}
