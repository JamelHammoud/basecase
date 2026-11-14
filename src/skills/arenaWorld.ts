import type { MainModule } from '@mujoco/mujoco';
import { ConditionedPhysics, type Conditions } from '../sim/conditions';
import { SimEngine, type Controller } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotPoseState } from '../types/robotics';
import type { Range } from './environment';
import { sha256Hex } from './hash';
import type { Random } from '../utils/seededRandom';

export { seededRandom, type Random } from '../utils/seededRandom';

export interface ArenaRanges {
  friction: Range;
  mass: Range;
  strength: Range;
  latencyMs: Range;
  jointNoiseDeg: number;
  baseYawDeg: number;
  baseOffsetMm: number;
}

export interface Instance extends Conditions {
  jointNoise: number[];
  yawDeg: number;
  offsetMm: [number, number];
}

const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export const trialSeed = (options: { salt: Uint8Array; variant: string; trial: number; environment: string }) =>
  sha256Hex(`arena|${toHex(options.salt)}|${options.variant}|${options.trial}|${options.environment}`);

const within = (random: Random, [lo, hi]: Range) => lo + (hi - lo) * random();
const symmetric = (random: Random, size: number) => (2 * random() - 1) * size;

export function drawInstance(random: Random, options: { ranges: ArenaRanges; bodies: number; joints: number }) {
  const { ranges, bodies, joints } = options;

  return {
    friction: within(random, ranges.friction),
    masses: Array.from({ length: bodies }, () => within(random, ranges.mass)),
    strength: within(random, ranges.strength),
    latencyMs: within(random, ranges.latencyMs),
    jointNoise: Array.from({ length: joints }, () => symmetric(random, ranges.jointNoiseDeg)),
    yawDeg: symmetric(random, ranges.baseYawDeg),
    offsetMm: [symmetric(random, ranges.baseOffsetMm), symmetric(random, ranges.baseOffsetMm)],
  } satisfies Instance;
}

export function withTimestep(model: SimModel, factor: number): SimModel {
  const xml = model.xml.replace(/timestep="([^"]+)"/, (_, dt: string) => `timestep="${Number(dt) * factor}"`);

  if (xml === model.xml) throw new Error('The model has no timestep to change.');

  return { ...model, xml };
}

export function startPose(
  joints: SimModel['joints'],
  start: { base: RobotPoseState; instance: Pick<Instance, 'jointNoise' | 'offsetMm'>; robot: string },
): RobotPoseState {
  const { base, instance, robot } = start;
  const values = { ...base.values };

  joints.forEach((j, i) => {
    if (j.robot !== robot) return;

    const [lo, hi] = j.range ?? [-Infinity, Infinity];

    values[j.id] = Math.max(lo, Math.min(hi, (values[j.id] ?? 0) + (instance.jointNoise[i] ?? 0)));
  });

  const root = base.roots?.[robot];
  const p = root?.position ?? [0, 0, 0];
  const position: [number, number, number] = [p[0] + instance.offsetMm[0], p[1], p[2] + instance.offsetMm[1]];

  return { ...base, values, roots: { ...base.roots, [robot]: { ...root, position } } };
}

const DIVERGENCE = ['mjWARN_BADQPOS', 'mjWARN_BADQVEL', 'mjWARN_BADQACC'] as const;

export class ArenaWorld {
  readonly engine: SimEngine;
  private mj: MainModule;
  private physics: ConditionedPhysics;

  constructor(mj: MainModule, model: SimModel) {
    this.mj = mj;
    this.physics = new ConditionedPhysics(mj);
    this.engine = new SimEngine(this.physics.module, model);
    this.engine.model.opt.disableflags |= mj.mjtDisableBit.mjDSBL_AUTORESET.value;
    this.physics.attach(this.engine.model);
  }

  private turn(robot: string, yawDeg: number) {
    const { mj, engine } = this;
    const key = engine.sim.robots.find((r) => r.key === robot);
    const id = key?.floating ? mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_JOINT.value, key.root) : -1;

    if (id < 0 || !yawDeg) return;

    const at = engine.model.jnt_qposadr[id] + 3;
    const half = (yawDeg * Math.PI) / 360;
    const [cw, sw] = [Math.cos(half), Math.sin(half)];
    const q = engine.data.qpos;
    const [w, x, y, z] = [q[at], q[at + 1], q[at + 2], q[at + 3]];

    q.set([cw * w - sw * z, cw * x - sw * y, cw * y + sw * x, cw * z + sw * w], at);
    mj.mj_forward(engine.model, engine.data);
  }

  prepare(options: { instance: Instance; controller: Controller; start: RobotPoseState; robot: string }) {
    const { instance, controller, start, robot } = options;
    const { engine } = this;

    engine.setController({ kind: 'hold' });
    this.physics.apply(engine.model, engine.data, instance);
    engine.setController(controller);
    engine.reset(startPose(engine.sim.joints, { base: start, instance, robot }));
    this.turn(robot, instance.yawDeg);
  }

  diverged(): boolean {
    const { mj, engine } = this;

    return DIVERGENCE.some((name) => {
      const stat = engine.data.warning.get(mj.mjtWarning[name].value);
      const count = stat?.number ?? 0;

      stat?.delete();

      return count > 0;
    });
  }

  dispose() {
    this.engine.dispose();
  }
}
