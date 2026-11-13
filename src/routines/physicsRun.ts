import type { MainModule } from '@mujoco/mujoco';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint } from '../types/robotics';
import {
  applyControl,
  type BodyControl,
  type BodyPose,
  BodyProbe,
  controlFor,
  NO_BODY,
  routineBody,
  type RoutineBody,
  SKILL_SECONDS,
} from './physicsBody';
import type { RoutineKit } from './physicsKit';
import type { Plan } from './planTypes';
import { type ScenarioRig, scenarioResult, startScenario } from './scenario';
import { CONTROL_PERIOD_MS, SKILL_MS } from './scenarioMocks';
import type { Scenario, ScenarioResult } from './scenarioTypes';
import type { Motion } from './schema';

export interface PhysicsSample {
  t: number;
  base: [number, number, number];
  yaw: number;
  tilt: number;
  joints: Record<string, number>;
}

export interface PhysicsScenarioResult extends ScenarioResult {
  physics: { samples: PhysicsSample[]; fellAt: number | null };
}

export interface PhysicsRunInput {
  mj: MainModule;
  plan: Plan;
  scenario: Scenario;
  model: SimModel;
  joints: RobotJoint[];
  kit: RoutineKit;
  engine?: SimEngine;
}

const SAMPLE_EVERY_MS = 50;
const D2R = Math.PI / 180;

type Skills = { body: string | null; head: string | null };

interface ActiveMove {
  token: number;
  skill: string;
  move: Motion;
  from: BodyPose;
  yaw: number;
  turned: number;
  finish: (ok: boolean) => void;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function reached(active: ActiveMove, pose: BodyPose): boolean {
  const { move, from } = active;
  const travelled = Math.hypot(pose.base[0] - from.base[0], pose.base[1] - from.base[1]);

  if (move.distance !== undefined && travelled >= move.distance) return true;

  return move.turn !== undefined && Math.abs(active.turned) >= Math.abs(move.turn) * D2R;
}

export class PhysicsRun {
  readonly engine: SimEngine;
  readonly samples: PhysicsSample[] = [];
  private readonly rig: ScenarioRig;
  private readonly probe: BodyProbe;
  private readonly body: RoutineBody;
  private control: BodyControl | null = null;
  private controlKey = '';
  private skills: Skills = { body: null, head: null };
  private active: ActiveMove | null = null;
  private fell: number | null = null;
  private readonly ownsEngine: boolean;
  t = 0;

  private constructor(input: PhysicsRunInput, rig: ScenarioRig, body: RoutineBody) {
    this.rig = rig;
    this.body = body;
    this.ownsEngine = !input.engine;
    this.engine = input.engine ?? new SimEngine(input.mj, input.model);
    this.engine.reset();
    this.probe = new BodyProbe(input.mj, this.engine, body);
    this.drive({ body: null, head: null });
    rig.host.skillLatency = (skill) => (SKILL_SECONDS[skill] ?? SKILL_MS / 1000) * 1000;
    rig.host.motion = { startMove: (started, finish) => this.startMove(started, finish) };
    rig.control.onChange = (skills) => this.drive(skills);
  }

  static async start(input: PhysicsRunInput): Promise<PhysicsRun> {
    const { kit } = input;
    const body = routineBody(input.model, input.joints, { skills: kit.policies, drive: kit.drive });

    if (!body) throw new Error(NO_BODY);

    return new PhysicsRun(input, await startScenario(input.plan, input.scenario), body);
  }

  private drive(skills: Skills) {
    this.skills = skills;

    const move = this.active?.skill === skills.body ? this.active.move : undefined;
    const next = controlFor(this.body, skills, move);
    const key = `${skills.body}|${JSON.stringify(move ?? null)}`;
    const current = this.control?.controller;

    if (key === this.controlKey && current?.kind === 'policy' && next.controller.kind === 'policy') {
      current.hold = next.controller.hold;

      return;
    }

    applyControl(this.engine, next, this.control);
    this.control = next;
    this.controlKey = key;
  }

  private startMove(started: { token: number; skill: string; move: Motion }, finish: (ok: boolean) => void) {
    const from = this.probe.pose();

    this.active = { ...started, from, yaw: from.yaw, turned: 0, finish };
    this.drive(this.skills);
  }

  private track() {
    const active = this.active;

    if (!active) return;

    if (this.rig.host.isCancelled(active.token)) {
      this.active = null;

      return;
    }

    const pose = this.probe.pose();

    active.turned += wrap(pose.yaw - active.yaw);
    active.yaw = pose.yaw;

    if (!reached(active, pose)) return;

    this.active = null;
    active.finish(true);
  }

  get done(): boolean {
    return this.t > this.rig.scenario.seconds * 1000;
  }

  get trace() {
    return this.rig.host.trace;
  }

  get said() {
    return this.rig.host.said;
  }

  private sample() {
    const pose = this.probe.pose();

    this.samples.push({ t: this.t / 1000, ...pose, joints: this.probe.jointValues() });
  }

  step(): boolean {
    if (this.done) return false;

    this.rig.clock.runUntil(this.t);

    if (this.t % SAMPLE_EVERY_MS === 0) this.sample();

    this.engine.step(CONTROL_PERIOD_MS / 1000);
    this.track();
    this.fell ??= this.probe.fellAt();
    this.t += CONTROL_PERIOD_MS;

    return !this.done;
  }

  result(): PhysicsScenarioResult {
    const fell = this.fell === null ? [] : [`The robot fell at ${this.fell.toFixed(1)} s.`];

    return { ...scenarioResult(this.rig, fell), physics: { samples: this.samples, fellAt: this.fell } };
  }

  dispose() {
    if (this.ownsEngine) this.engine.dispose();
  }
}

export async function runPhysics(input: PhysicsRunInput): Promise<PhysicsScenarioResult> {
  const run = await PhysicsRun.start(input);

  try {
    while (run.step());

    return run.result();
  } finally {
    run.dispose();
  }
}
