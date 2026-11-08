import type { MainModule } from '@mujoco/mujoco';
import { type Controller, SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint } from '../types/robotics';
import { BodyProbe, controllerFor, routineBody, type RoutineBody, SKILL_SECONDS } from './physicsBody';
import type { RoutineKit } from './physicsKit';
import type { Plan } from './planTypes';
import { type ScenarioRig, scenarioResult, startScenario } from './scenario';
import { CONTROL_PERIOD_MS, SKILL_MS } from './scenarioMocks';
import type { Scenario, ScenarioResult } from './scenarioTypes';

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

type Skills = { body: string | null; head: string | null };

export class PhysicsRun {
  readonly engine: SimEngine;
  readonly samples: PhysicsSample[] = [];
  private readonly rig: ScenarioRig;
  private readonly probe: BodyProbe;
  private readonly body: RoutineBody;
  private controller: Controller = { kind: 'hold' };
  private bodySkill: string | null = null;
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
    rig.control.onChange = (skills) => this.drive(skills);
  }

  static async start(input: PhysicsRunInput): Promise<PhysicsRun> {
    const body = routineBody(input.model, input.joints, input.kit.policies);

    if (!body) throw new Error('Only a robot that walks on legs runs a Routine in physics.');

    return new PhysicsRun(input, await startScenario(input.plan, input.scenario), body);
  }

  private drive(skills: Skills) {
    const next = controllerFor(this.body, skills);
    const sameBody = skills.body === this.bodySkill && next.kind === this.controller.kind;

    this.bodySkill = skills.body;

    if (sameBody && this.controller.kind === 'policy' && next.kind === 'policy') {
      this.controller.hold = next.hold;

      return;
    }

    this.controller = next;
    this.engine.setController(next);
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
