import type { WheelSetup } from './drive';
import type { PolicySpec } from './policy';

export type V3 = [number, number, number];

export interface RouteKey {
  t: number;
  forward: number;
  left: number;
}

export interface RouteLimits {
  forward: [number, number];
  left: [number, number];
  turn: number;
}

export interface RouteSpec {
  keys: RouteKey[];
  gain: number;
  headingGain: number;
  deadband: number;
  limits: RouteLimits;
  accel?: { forward: number; turn: number };
  brisk?: { speed: number; band: number };
}

export type RouteDrive = { kind: 'rover'; wheels: WheelSetup[] } | { kind: 'policy'; policy: PolicySpec };

export interface RouteController {
  kind: 'route';
  robot: string;
  route: RouteSpec;
  drive: RouteDrive;
}

interface Planar {
  forward: number;
  left: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const MIN_SHARE = 0.4;
const STEER_COS = 0.2;
const STEER_DISTANCE = 0.06;

export function routeAt(keys: RouteKey[], t: number): { at: Planar; velocity: Planar } {
  const next = keys.findIndex((k) => k.t > t);
  const still = { forward: 0, left: 0 };
  const planar = (k: RouteKey | undefined) => ({ forward: k?.forward ?? 0, left: k?.left ?? 0 });

  if (next < 0) return { at: planar(keys.at(-1)), velocity: still };

  if (next === 0) return { at: planar(keys[0]), velocity: still };

  const a = keys[next - 1];
  const b = keys[next];
  const span = Math.max(b.t - a.t, 1e-6);
  const k = (t - a.t) / span;
  const at = { forward: a.forward + (b.forward - a.forward) * k, left: a.left + (b.left - a.left) * k };

  return { at, velocity: { forward: (b.forward - a.forward) / span, left: (b.left - a.left) / span } };
}

function toBody(w: Planar, yaw: number): Planar {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);

  return { forward: w.forward * c + w.left * s, left: -w.forward * s + w.left * c };
}

function boxShare(u: Planar, limits: RouteLimits): number {
  const axis = (x: number, [lo, hi]: [number, number]) => {
    if (x > 1e-9) return hi > 0 ? Math.min(1, hi / x) : 0;

    if (x >= -1e-9) return 1;

    return lo < 0 ? Math.min(1, lo / x) : 0;
  };

  return Math.min(axis(u.forward, limits.forward), axis(u.left, limits.left));
}

function steer(w: Planar, yaw: number, spec: RouteSpec): V3 {
  const { limits } = spec;
  const heading = Math.atan2(w.left, w.forward);
  const behind = Math.abs(wrap(heading - yaw)) > Math.PI / 2;
  const reverse = limits.forward[1] <= 0 || (limits.forward[0] < 0 && behind);
  const error = wrap(heading + (reverse ? Math.PI : 0) - yaw);
  const speed = (Math.hypot(w.forward, w.left) * Math.max(0, Math.cos(error) - STEER_COS)) / (1 - STEER_COS);
  const forward = clamp(reverse ? -speed : speed, limits.forward[0], limits.forward[1]);

  return [forward, 0, clamp(spec.headingGain * error, -limits.turn, limits.turn)];
}

export function routeCommand(spec: RouteSpec, state: { t: number; at: Planar; yaw: number }): V3 {
  const goal = routeAt(spec.keys, state.t);
  const error = { forward: goal.at.forward - state.at.forward, left: goal.at.left - state.at.left };
  const distance = Math.hypot(error.forward, error.left);
  const gain = distance > spec.deadband ? spec.gain : 0;
  const w = {
    forward: goal.velocity.forward + gain * error.forward,
    left: goal.velocity.left + gain * error.left,
  };

  if (Math.hypot(w.forward, w.left) < 1e-4) return [0, 0, 0];

  const u = toBody(w, state.yaw);
  const share = boxShare(u, spec.limits);
  const settling = distance < STEER_DISTANCE && Math.hypot(goal.velocity.forward, goal.velocity.left) < 1e-3;

  if (share < MIN_SHARE && settling) return [0, 0, 0];

  if (share < MIN_SHARE) return steer(w, state.yaw, spec);

  const turn = clamp(-spec.headingGain * wrap(state.yaw), -spec.limits.turn, spec.limits.turn);
  const lift = briskShare(spec, { speed: Math.hypot(u.forward, u.left) * share, distance });

  const { limits } = spec;

  return [
    clamp(u.forward * share * lift, limits.forward[0], limits.forward[1]),
    clamp(u.left * share * lift, limits.left[0], limits.left[1]),
    turn,
  ];
}

function briskShare(spec: RouteSpec, options: { speed: number; distance: number }): number {
  const { brisk } = spec;
  const { speed, distance } = options;

  if (!brisk || speed <= 1e-6 || speed >= brisk.speed) return 1;

  return distance > brisk.band ? brisk.speed / speed : 0;
}

export function wheelSpeeds(wheels: WheelSetup[], command: V3): Record<string, number> {
  return Object.fromEntries(
    wheels.map((w) => [w.joint, (w.spin * (command[0] * 1000 - command[2] * w.lateralMm)) / Math.max(w.radiusMm, 1)]),
  );
}

export interface RootAccess {
  qpos: ArrayLike<number>;
  rootQpos: number;
  time: number;
}

export function limitedCommand(spec: RouteSpec, options: { want: V3; last: V3; dt: number }): V3 {
  const { want, last, dt } = options;

  if (!spec.accel) return want;

  const step = [spec.accel.forward * dt, spec.accel.forward * dt, spec.accel.turn * dt];

  return want.map((v, i) => clamp(v, last[i] - step[i], last[i] + step[i])) as V3;
}

export class RouteLoop {
  readonly spec: RouteSpec;
  private origin: { x: number; y: number; t: number } | null = null;
  private last: { command: V3; t: number } = { command: [0, 0, 0], t: 0 };

  constructor(spec: RouteSpec) {
    this.spec = spec;
  }

  command(root: RootAccess): V3 {
    const { qpos, rootQpos: q, time } = root;
    const origin = this.origin ?? { x: qpos[q], y: qpos[q + 1], t: time };

    this.origin = origin;

    const [w, x, y, z] = [qpos[q + 3], qpos[q + 4], qpos[q + 5], qpos[q + 6]];
    const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    const at = { forward: -(qpos[q + 1] - origin.y), left: qpos[q] - origin.x };
    const t = time - origin.t;
    const want = routeCommand(this.spec, { t, at, yaw });
    const command = limitedCommand(this.spec, { want, last: this.last.command, dt: Math.max(0, t - this.last.t) });

    this.last = { command, t };

    return command;
  }
}

interface RouteData {
  qpos: ArrayLike<number>;
  ctrl: { [i: number]: number };
  time: number;
}

export class RouteRunner {
  private readonly loop: RouteLoop;
  private readonly rootQpos: number;
  private readonly wheels: WheelSetup[];
  private readonly actuators: number[];

  constructor(c: RouteController, options: { rootQpos: number; joints: Array<{ id: string; actuator: number }> }) {
    this.loop = new RouteLoop(c.route);
    this.rootQpos = options.rootQpos;
    this.wheels = c.drive.kind === 'rover' ? c.drive.wheels : [];
    this.actuators = this.wheels.map((w) => options.joints.find((j) => j.id === w.joint)?.actuator ?? -1);
  }

  apply(data: RouteData, policy: { command: V3 } | null) {
    const command = this.loop.command({ qpos: data.qpos, rootQpos: this.rootQpos, time: data.time });

    if (policy) policy.command = command;

    const speeds = wheelSpeeds(this.wheels, command);

    this.wheels.forEach((w, i) => {
      if (this.actuators[i] >= 0) data.ctrl[this.actuators[i]] = speeds[w.joint];
    });
  }
}

type AnyController = { kind: string; drive?: RouteDrive; policy?: PolicySpec; robot?: string };

export function routePolicy(c: AnyController): { policy: PolicySpec; robot: string } | null {
  if (c.kind === 'policy' && c.policy && c.robot) return { policy: c.policy, robot: c.robot };

  return c.kind === 'route' && c.drive?.kind === 'policy' && c.robot
    ? { policy: c.drive.policy, robot: c.robot }
    : null;
}
