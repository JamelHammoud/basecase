import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import { signalReaders } from './arenaSignals';
import type { Trace } from './contract';
import type { SignalSource } from './environment';
import type { BodyFacts } from './anythingBody';
import { restFeet, footTargets, type Foot } from './anythingFeet';
import { Ik, targetValue, type IkJoint, type IkTarget } from './anythingIk';
import type { IntentKey, IntentPose, PartGoal } from './anythingTypes';

const D2R = Math.PI / 180;

export const TRACE_DT = 0.02;

const REST_SLACK_MM = 3;
const GOAL_AXES = ['right', 'forward', 'up', 'height'] as const;

interface BaseFields {
  forward: number;
  left: number;
  up: number;
  tilt: number;
}

interface KeyState {
  t: number;
  base: BaseFields;
  joints: number[];
}

const baseOf = (pose: IntentPose): BaseFields => ({
  forward: pose.base?.forward ?? 0,
  left: pose.base?.left ?? 0,
  up: pose.base?.up ?? 0,
  tilt: pose.base?.tilt ?? 0,
});

const QUAT_MUL = (a: number[], b: number[]) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

export class Poser {
  readonly engine: SimEngine;
  readonly facts: BodyFacts;
  readonly jointAdr: Record<string, number>;
  private readonly mj: MainModule;
  private readonly rootAdr: number | null;
  private readonly ik: Ik;
  readonly feet: Foot[];

  constructor(mj: MainModule, model: SimModel, facts: BodyFacts) {
    this.mj = mj;
    this.facts = facts;
    this.engine = new SimEngine(mj, model);
    this.ik = new Ik(mj, this.engine);

    const adr = (name: string) =>
      this.engine.model.jnt_qposadr[mj.mj_name2id(this.engine.model, mj.mjtObj.mjOBJ_JOINT.value, name)];

    this.jointAdr = Object.fromEntries(facts.joints.map((j) => [j.id, adr(j.name)]));
    this.rootAdr = facts.floating ? adr(facts.root) : null;
    this.feet = restFeet({ mj, engine: this.engine, facts, bodyOf: (part) => this.bodyOf(part) });
  }

  bodyOf(part: string): number {
    const body = this.facts.parts.find((p) => p.id === part)?.body;
    const id = body ? this.mj.mj_name2id(this.engine.model, this.mj.mjtObj.mjOBJ_BODY.value, body) : -1;

    if (id < 0) throw new Error(`The robot has no part ${part}.`);

    return id;
  }

  ikJoints(exclude: string[] = []): IkJoint[] {
    return this.facts.joints
      .filter((j) => j.actuated && j.drive === 'position' && !exclude.includes(j.id))
      .map((j) => ({
        qpos: this.jointAdr[j.id],
        range: [(j.range?.[0] ?? -180) * D2R, (j.range?.[1] ?? 180) * D2R] as [number, number],
      }));
  }

  withBase(joints: number[], base: BaseFields): number[] {
    const q = [...joints];
    const at = this.rootAdr;

    if (at === null) return q;

    const rest = this.facts.rest;

    q[at] = rest[at] + base.left;
    q[at + 1] = rest[at + 1] - base.forward;
    q[at + 2] = rest[at + 2] + base.up;

    const half = base.tilt / 2;
    const turned = QUAT_MUL([Math.cos(half), Math.sin(half), 0, 0], rest.slice(at + 3, at + 7));

    turned.forEach((v, k) => (q[at + 3 + k] = v));

    return q;
  }

  partTargets(parts: Record<string, PartGoal>): IkTarget[] {
    const [bx, by, bz] = this.facts.base;

    return Object.entries(parts).flatMap(([part, goal]) => {
      const body = this.bodyOf(part);
      const out: IkTarget[] = [];

      if (goal.right !== undefined) out.push({ body, axis: 0, value: bx - goal.right / 1000 });

      if (goal.forward !== undefined) out.push({ body, axis: 1, value: by - goal.forward / 1000 });

      if (goal.up !== undefined) out.push({ body, axis: 2, value: bz + goal.up / 1000 });

      if (goal.height !== undefined) out.push({ body, axis: 2, value: goal.height / 1000 });

      return out;
    });
  }

  private restsFoot(part: string, goal: PartGoal): boolean {
    const rest = this.feet.some((f) => f.part === part) ? this.facts.parts.find((p) => p.id === part) : undefined;

    return !!rest && GOAL_AXES.every((a) => goal[a] === undefined || Math.abs(goal[a] - rest[a]) <= REST_SLACK_MM);
  }

  private movedParts(parts: Record<string, PartGoal> | undefined): Record<string, PartGoal> | undefined {
    if (!parts) return parts;

    return Object.fromEntries(Object.entries(parts).filter(([part, goal]) => !this.restsFoot(part, goal)));
  }

  keyQpos(key: IntentPose, start: number[] = this.facts.rest): { q: number[]; miss: number } {
    const pose: IntentPose = { ...key, parts: this.movedParts(key.parts) };
    const base = baseOf(pose);
    const q = this.withBase([...this.facts.rest], base);

    for (const [id, deg] of Object.entries(pose.joints ?? {})) {
      if (id in this.jointAdr) q[this.jointAdr[id]] = deg * D2R;
    }

    const goals = this.partTargets(pose.parts ?? {});
    const targets = [...goals, ...this.plantedFeet(pose)];

    if (!targets.length) return { q, miss: 0 };

    const joints = this.ikJoints(Object.keys(pose.joints ?? {}));
    const seed = [...q];

    for (const j of joints) seed[j.qpos] = start[j.qpos];

    const solved = this.ik.solve(seed, { joints, targets });

    return { q: solved.q, miss: goals.length ? this.missOf(solved.q, goals) : 0 };
  }

  private missOf(q: number[], goals: IkTarget[]): number {
    this.engine.setState(q);

    return Math.hypot(...goals.map((g) => g.value - targetValue(this.engine.data, g)));
  }

  private plantedFeet(pose: IntentPose): IkTarget[] {
    const moved = !!pose.parts && Object.keys(pose.parts).length > 0;
    const b = baseOf(pose);
    const still = !moved && !b.up && !b.tilt && !b.forward && !b.left;

    if (still) return [];

    return this.feet.filter((f) => !pose.parts?.[f.part]).flatMap((f) => footTargets(f, b));
  }

  keyStates(keys: IntentKey[]): { states: KeyState[]; miss: number } {
    const sorted = [...keys].sort((a, b) => a.t - b.t);
    let previous = this.facts.rest;
    let miss = 0;
    const states = sorted.map((k) => {
      const solved = this.keyQpos(k, previous);

      previous = solved.q;
      miss = Math.max(miss, solved.miss);

      return { t: k.t, base: baseOf(k), joints: solved.q };
    });

    return { states, miss };
  }

  frameAt(states: KeyState[], t: number): number[] {
    const next = states.findIndex((s) => s.t >= t);

    if (next <= 0) {
      const s = states[next === 0 ? 0 : states.length - 1];

      return this.withBase(s.joints, s.base);
    }

    const a = states[next - 1];
    const b = states[next];
    const k = (t - a.t) / Math.max(b.t - a.t, 1e-9);
    const mix = (x: number, y: number) => x * (1 - k) + y * k;
    const joints = a.joints.map((v, i) => mix(v, b.joints[i]));
    const base = {
      forward: mix(a.base.forward, b.base.forward),
      left: mix(a.base.left, b.base.left),
      up: mix(a.base.up, b.base.up),
      tilt: mix(a.base.tilt, b.base.tilt),
    };

    return this.withBase(joints, base);
  }

  frames(keys: IntentKey[], horizonS: number): { frames: number[][]; miss: number } {
    if (!keys.length) return { frames: [this.facts.rest, this.facts.rest], miss: 0 };

    const { states, miss } = this.keyStates(keys);
    const ticks = Math.floor(horizonS / TRACE_DT + 1e-9) + 1;

    return { frames: Array.from({ length: ticks }, (_, i) => this.frameAt(states, i * TRACE_DT)), miss };
  }

  trace(frames: ArrayLike<number>[], dt: number, signals: Record<string, SignalSource>): Trace {
    const readers = signalReaders({ mj: this.mj, engine: this.engine, robot: this.facts.robot }, signals);
    const out: Record<string, number[]> = Object.fromEntries(Object.keys(readers).map((n) => [n, []]));

    frames.forEach((q, i) => {
      this.engine.setState(q);
      this.engine.data.time = i * dt;

      for (const [name, read] of Object.entries(readers)) out[name].push(read());
    });

    return { dt, signals: out };
  }

  dispose() {
    this.engine.dispose();
  }
}
