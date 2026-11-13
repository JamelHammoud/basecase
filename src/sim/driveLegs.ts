import type { JointValues, RobotAnimation, ScenePart } from '../types/robotics';
import { sampleAnimation } from '../utils/animation';
import { buildGait } from '../utils/gait';
import { isMovable, type Rig, type V3 } from '../utils/kinematics';
import { isWheelJoint } from './morphology';
import type { DriveCommand, DriveLoop, DriveOutput } from './driveTypes';

export interface FootPoint {
  part: string;
  point: V3;
}

export interface LegsSetup {
  kind: 'legs';
  robot: string;
  rig: Rig;
  feet: FootPoint[];
  start: JointValues;
}

type Pair = [RobotAnimation, RobotAnimation];

interface Cycles {
  stand: RobotAnimation;
  forward: Pair;
  strafe: Pair;
  turn: Pair;
  period: number;
  joints: string[];
}

const STAND_RAMP_S = 0.5;
const STRIDE_SHARE = 0.55;
const LIFT_SHARE = 0.22;
const CROUCH_SHARE = 0.16;
const DUTY = 0.56;
const COMMAND_EASE = 0.12;

function ownedBy(rig: Rig, jointId: string): string[] {
  return [...rig.ownerOf].flatMap(([id, owner]) => (owner === jointId ? [id] : []));
}

export function footPoints(rig: Rig, parts: ScenePart[], robot?: string): FootPoint[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const joints = rig.joints.filter(
    (j) => isMovable(j) && (!robot || rig.robotOf.get(j.id) === robot) && !isWheelJoint(j, byId, rig),
  );
  const parents = new Set(joints.map((j) => rig.parentOf.get(j.id)));

  return joints
    .filter((j) => !parents.has(j.id) && j.limb !== 'arm')
    .flatMap((j) => {
      const owned = ownedBy(rig, j.id).flatMap((id) => byId.get(id) ?? []);
      const lowest = owned.sort((a, b) => a.position[1] - b.position[1])[0];

      if (!lowest) return [];

      const { position, dimensions } = lowest;
      const point: V3 = [position[0], position[1] - dimensions.height / 2, position[2]];

      return [{ part: lowest.id, point }];
    });
}

function feetCenter(feet: FootPoint[]): V3 {
  const n = Math.max(feet.length, 1);

  return [0, 1, 2].map((a) => feet.reduce((s, f) => s + f.point[a], 0) / n) as V3;
}

function bake(setup: LegsSetup, dirs: V3[], name: string, stride: number): RobotAnimation {
  const { rig, feet, start } = setup;
  const center = feetCenter(feet);
  const leg = Math.max(rig.rootPivot[1] - center[1], 40);
  const byId = new Map(feet.map((f) => [f.part, f.point]));
  const built = buildGait(
    rig,
    {
      feet: feet.map((f) => f.part),
      footDirs: dirs,
      keepOrientation: false,
      stride,
      lift: stride > 0 ? leg * LIFT_SHARE : 0,
      crouch: leg * CROUCH_SHARE,
      duty: DUTY,
      samples: 24,
    },
    { values: start },
    { pointOf: (id) => byId.get(id) ?? null, name },
  );

  if (typeof built === 'string') throw new Error(built);

  return built.animation;
}

function turnDirs(feet: FootPoint[]): V3[] {
  const center = feetCenter(feet);
  const offsets = feet.map((f) => [f.point[0] - center[0], f.point[2] - center[2]]);
  const radius = Math.max(...offsets.map(([x, z]) => Math.hypot(x, z)), 1);

  return offsets.map(([x, z]) => [z / radius, 0, -x / radius]);
}

const reversed = (dirs: V3[]) => dirs.map((d) => d.map((x) => -x) as V3);

const baked = new WeakMap<LegsSetup, Cycles>();

export function bakeCycles(setup: LegsSetup): Cycles {
  const known = baked.get(setup);

  if (known) return known;

  const cycles = freshCycles(setup);

  baked.set(setup, cycles);

  return cycles;
}

function freshCycles(setup: LegsSetup): Cycles {
  const { rig, feet } = setup;
  const leg = Math.max(rig.rootPivot[1] - feetCenter(feet)[1], 40);
  const same = (d: V3) => feet.map(() => d);
  const stride = leg * STRIDE_SHARE;
  const pair = (dirs: V3[], name: string): Pair => [
    bake(setup, dirs, name, stride),
    bake(setup, reversed(dirs), name, stride),
  ];
  const forward = pair(same([0, 0, 1]), 'Forward');

  return {
    stand: bake(setup, same([0, 0, 1]), 'Stand', 0),
    forward,
    strafe: pair(same([1, 0, 0]), 'Strafe'),
    turn: pair(turnDirs(feet), 'Turn'),
    period: forward[0].duration,
    joints: Object.keys(forward[0].keyframes[0]?.values ?? {}),
  };
}

const clampUnit = (x: number) => Math.max(-1, Math.min(1, x));

export class LegsDrive implements DriveLoop {
  private readonly cycles: Cycles;

  private readonly start: JointValues;

  private target: V3 = [0, 0, 0];

  private eased: V3 = [0, 0, 0];

  private phase = 0;

  private lastTime: number | null = null;

  private startTime = 0;

  constructor(setup: LegsSetup) {
    this.cycles = bakeCycles(setup);
    this.start = setup.start;
  }

  command(c: DriveCommand) {
    this.target = [clampUnit(c.v[0]), clampUnit(c.v[1]), clampUnit(c.v[2])];
  }

  tick(time: number): DriveOutput {
    if (this.lastTime === null) this.startTime = time;

    const dt = this.lastTime === null ? 0 : time - this.lastTime;

    this.lastTime = time;
    this.eased = this.eased.map((x, i) => x + (this.target[i] - x) * Math.min(1, COMMAND_EASE * (dt / 0.002))) as V3;

    const amount = Math.max(...this.eased.map(Math.abs));

    if (amount > 0.01) this.phase = (this.phase + dt / this.cycles.period) % 1;

    return { values: this.blend(time - this.startTime) };
  }

  private blend(since: number): JointValues {
    const { cycles, eased, phase } = this;
    const stand = sampleAnimation(cycles.stand, phase * cycles.period).values;
    const total = Math.max(
      1,
      eased.reduce((s, x) => s + Math.abs(x), 0),
    );
    const parts: Array<[Pair, number]> = [
      [cycles.forward, eased[0]],
      [cycles.strafe, eased[1]],
      [cycles.turn, eased[2]],
    ];
    const out: JointValues = { ...stand };

    for (const [pair, command] of parts) {
      const weight = Math.abs(command) / total;

      if (weight < 1e-3) continue;

      const sample = sampleAnimation(pair[command >= 0 ? 0 : 1], phase * cycles.period).values;

      for (const id of cycles.joints) out[id] += (sample[id] - stand[id]) * weight;
    }

    return this.rampFromStart(out, since);
  }

  private rampFromStart(values: JointValues, since: number): JointValues {
    if (since >= STAND_RAMP_S) return values;

    const u = since / STAND_RAMP_S;
    const out: JointValues = {};

    for (const id of Object.keys(values)) out[id] = (this.start[id] ?? 0) + (values[id] - (this.start[id] ?? 0)) * u;

    return out;
  }
}
