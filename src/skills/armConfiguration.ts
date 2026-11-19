import type { MainModule, MjModel } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { JointValues } from '../types/robotics';
import type { ConfigurationJoint } from './configurationSearch';

export const ARM_CLEARANCE_M = 0.002;

export interface ArmCoordinate extends ConfigurationJoint {
  id: string;
  qpos: number;
}

export function bodyAncestors(model: MjModel, body: number): Set<number> {
  const out = new Set<number>();

  for (let b = body; b > 0; b = model.body_parentid[b]) out.add(b);

  return out;
}

function magnitude(v: ArrayLike<number>, offset: number): number {
  return Math.hypot(v[offset], v[offset + 1], v[offset + 2]);
}

function slideTravel(model: MjModel, qpos: ArrayLike<number>, body: number): number {
  let distance = 0;
  const first = model.body_jntadr[body];

  for (let j = first; j < first + model.body_jntnum[body]; j++) {
    if (model.jnt_type[j] === 2) distance += Math.abs(qpos[model.jnt_qposadr[j]]);
  }

  return distance;
}

function travelBound(model: MjModel, joint: number, qpos: ArrayLike<number>): number {
  const root = model.jnt_bodyid[joint];
  let reach = 0;

  for (let g = 0; g < model.ngeom; g++) {
    const body = model.geom_bodyid[g];

    if (!bodyAncestors(model, body).has(root)) continue;

    let distance = model.geom_rbound[g] + magnitude(model.geom_pos, g * 3) + magnitude(model.jnt_pos, joint * 3);

    for (let b = body; b !== root; b = model.body_parentid[b])
      distance += magnitude(model.body_pos, b * 3) + slideTravel(model, qpos, b);

    reach = Math.max(reach, distance);
  }

  return Math.max(reach, ARM_CLEARANCE_M);
}

function supported(model: MjModel, sim: SimModel) {
  if (!sim.collisionGeometry || sim.collisionGeometry.fallbackParts.length)
    throw new Error('Motion planning needs complete collision geometry.');

  if (sim.robots.some((r) => r.floating)) throw new Error('Motion planning needs fixed robot bases.');

  if (model.neq || sim.joints.some((j) => j.loop))
    throw new Error('Motion planning does not support closure constraints.');

  const moving = Array.from({ length: model.njnt }, (_, j) => model.jnt_type[j]).some((type) => type < 2);

  if (moving || model.nmocap || sim.bodies.some((b) => b.moves))
    throw new Error('Motion planning does not support moving obstacles.');

  if (model.njnt !== sim.joints.length) throw new Error('Motion planning does not support moving obstacles.');

  const meshes = [...sim.xml.matchAll(/<mesh\b[^>]*>/g)];
  const explicitHulls = meshes.every(([tag]) => /\binertia="convex"/.test(tag) && /\bvertex="/.test(tag));

  if (model.nflex || model.nhfield || !explicitHulls)
    throw new Error('Motion planning needs primitives or explicit convex collision hulls.');

  if (sim.joints.some((j) => j.actuator < 0 || j.drive !== 'position'))
    throw new Error('Motion planning needs powered joints with position control.');
}

export class ArmConfiguration {
  readonly engine: SimEngine;
  readonly joints: ArmCoordinate[];
  readonly start: number[];
  private readonly mj: MainModule;
  private readonly rest: Float64Array;
  readonly fixedValues: JointValues;
  private readonly moving: Set<number>;
  private readonly movingGeometry: Uint8Array;
  separationM: number;
  private readonly marginM: number;
  private readonly clearanceM: number;
  private certificate: { qpos: Float64Array; separation: number } | null = null;
  private readonly physicalBounds: { qpos: number; travelM: number }[];

  constructor(mj: MainModule, sim: SimModel, parts: string[], options: { marginM?: number; clearanceM?: number } = {}) {
    this.mj = mj;
    this.clearanceM = options.clearanceM ?? ARM_CLEARANCE_M;
    this.marginM = options.marginM ?? this.clearanceM;
    this.separationM = this.marginM;
    this.engine = new SimEngine(mj, sim);

    try {
      supported(this.engine.model, sim);
      this.joints = this.coordinates(parts);
      this.rest = Float64Array.from(this.engine.data.qpos as ArrayLike<number>);
      this.start = this.joints.map((j) => this.rest[j.qpos]);

      const angles = this.engine.jointAngles();

      this.fixedValues = Object.fromEntries(
        sim.joints.map((j, i) => [j.id, angles[i] * (j.type === 'revolute' ? 180 / Math.PI : 1000)]),
      );
      this.moving = this.movingBodies();

      const model = this.engine.model;

      this.movingGeometry = Uint8Array.from(
        Array.from({ length: model.ngeom }, (_, g) => Number(this.moving.has(model.geom_bodyid[g]))),
      );
      this.physicalBounds = Array.from({ length: model.njnt }, (_, joint) => ({
        qpos: model.jnt_qposadr[joint],
        travelM: model.jnt_type[joint] === 3 ? travelBound(model, joint, this.rest) : Infinity,
      }));
      this.prepareGeometry();
    } catch (error) {
      this.engine.dispose();

      throw error;
    }
  }

  private coordinates(parts: string[]): ArmCoordinate[] {
    const { model, sim } = this.engine;
    const ancestors = new Set<number>();
    const targets = new Set<number>();

    for (const part of parts) {
      const owner = sim.bodies.find((b) => b.parts.includes(part));
      const body = owner ? this.mj.mj_name2id(model, this.mj.mjtObj.mjOBJ_BODY.value, owner.name) : -1;

      if (body < 0) throw new Error(`The model has no part ${part}.`);

      targets.add(body);

      for (const b of bodyAncestors(model, body)) ancestors.add(b);
    }

    const joints = sim.joints.flatMap((j) => {
      const id = this.mj.mj_name2id(model, this.mj.mjtObj.mjOBJ_JOINT.value, j.name);

      if (!ancestors.has(model.jnt_bodyid[id])) return [];

      if (j.type !== 'revolute') throw new Error('Motion planning needs revolute target chains.');

      const continuous = !model.jnt_limited[id] && !model.actuator_ctrllimited[j.actuator];
      const range: [number, number] = continuous
        ? [-Math.PI, Math.PI]
        : [model.jnt_range[id * 2], model.jnt_range[id * 2 + 1]];

      if (!model.jnt_limited[id] && !continuous) {
        range[0] = -Infinity;
        range[1] = Infinity;
      }

      if (model.actuator_ctrllimited[j.actuator]) {
        range[0] = Math.max(range[0], model.actuator_ctrlrange[j.actuator * 2]);
        range[1] = Math.min(range[1], model.actuator_ctrlrange[j.actuator * 2 + 1]);
      }

      return [
        {
          id: j.id,
          qpos: model.jnt_qposadr[id],
          range,
          continuous,
          travelM: travelBound(model, id, this.engine.data.qpos),
          preferStart: targets.has(model.jnt_bodyid[id]),
        },
      ];
    });

    if (!joints.length || joints.length > 12) throw new Error('Motion planning supports chains with 1 to 12 joints.');

    return joints;
  }

  private movingBodies(): Set<number> {
    const { model } = this.engine;
    const roots = new Set<number>();

    for (let j = 0; j < model.njnt; j++) {
      if (this.joints.some((coordinate) => coordinate.qpos === model.jnt_qposadr[j])) roots.add(model.jnt_bodyid[j]);
    }

    return new Set(
      Array.from({ length: model.nbody }, (_, b) => b).filter((b) =>
        [...bodyAncestors(model, b)].some((parent) => roots.has(parent)),
      ),
    );
  }

  private prepareGeometry() {
    const { model, sim } = this.engine;
    const missing = sim.bodies.some((b) => {
      const id = this.mj.mj_name2id(model, this.mj.mjtObj.mjOBJ_BODY.value, b.name);

      return (b.parts.length > 0 || !!b.world?.length) && model.body_geomnum[id] === 0;
    });

    if (missing) throw new Error('Motion planning needs complete collision geometry.');

    for (let g = 0; g < model.ngeom; g++) model.geom_margin[g] = Math.max(model.geom_margin[g], this.marginM);

    for (let b = 0; b < model.nbody; b++) model.body_margin[b] = Math.max(model.body_margin[b], this.marginM);

    for (let p = 0; p < model.npair; p++) model.pair_margin[p] = Math.max(model.pair_margin[p], this.marginM);
  }

  clear = (q: number[]): boolean => {
    const { data } = this.engine;
    const qpos = data.qpos;

    qpos.set(this.rest);
    this.joints.forEach((j, i) => (qpos[j.qpos] = q[i]));

    return this.collisionFree();
  };

  clearState(qpos: ArrayLike<number>): boolean {
    const certificate = this.certificate;
    const travel = certificate
      ? this.physicalBounds.reduce(
          (sum, joint) => sum + 2 * Math.abs(qpos[joint.qpos] - certificate.qpos[joint.qpos]) * joint.travelM,
          0,
        )
      : Infinity;

    if (certificate && Number.isFinite(travel) && travel + this.clearanceM + 1e-9 < certificate.separation) return true;

    this.certificate = null;

    if (Array.from(qpos).some((q) => !Number.isFinite(q))) return false;

    this.engine.data.qpos.set(qpos);

    const clear = this.collisionFree();

    if (clear) this.certificate = { qpos: Float64Array.from(qpos), separation: this.separationM };

    return clear;
  }

  private collisionFree(): boolean {
    const { model, data } = this.engine;

    this.mj.mj_kinematics(model, data);
    this.mj.mj_collision(model, data);

    const count = data.ncon;

    this.separationM = this.marginM;

    if (!count) return true;

    const contacts = data.contact;
    let clear = true;

    for (let i = 0; i < count; i++) {
      const c = contacts.get(i);
      const involved = c && (this.movingGeometry[c.geom1] || this.movingGeometry[c.geom2]);
      const distance = c?.dist ?? Infinity;

      if (involved && distance < this.clearanceM) clear = false;

      if (involved) this.separationM = Math.min(this.separationM, distance);

      c?.delete();
    }

    contacts.delete();

    return clear;
  }

  values(q: number[]): JointValues {
    return { ...this.fixedValues, ...Object.fromEntries(this.joints.map((j, i) => [j.id, (q[i] * 180) / Math.PI])) };
  }

  dispose() {
    this.engine.dispose();
  }
}
