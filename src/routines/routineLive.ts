import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from '../sim/engine';
import type { RobotJoint } from '../types/robotics';
import type { RoutineKit } from './physicsKit';
import { PhysicsRun } from './physicsRun';
import type { Plan } from './planTypes';
import type { VisionResult } from '../vision/protocol';
import { RoutineVision } from './routineVision';
import type { Scenario, TraceEvent } from './scenarioTypes';

export interface LiveRoutineInput {
  plan: Plan;
  scenario: Scenario;
  joints: RobotJoint[];
  kit: RoutineKit;
}

export interface LiveUpdate {
  events: TraceEvent[];
  said: string[];
  done: boolean;
  failures: string[];
}

export class LiveRoutine {
  private readonly run: PhysicsRun;
  private readonly vision: RoutineVision;
  private sentEvents = 0;
  private sentSaid = 0;

  private constructor(run: PhysicsRun, vision: RoutineVision) {
    this.run = run;
    this.vision = vision;
  }

  static async start(mj: MainModule, engine: SimEngine, input: LiveRoutineInput): Promise<LiveRoutine> {
    const vision = new RoutineVision();
    const run = await PhysicsRun.start({ mj, engine, model: engine.sim, ...input, perception: vision });

    return new LiveRoutine(run, vision);
  }

  see(result: VisionResult, ageMs = 0) {
    this.vision.push({ ...result, timestamp: this.run.t - ageMs });
  }

  advance(seconds: number): LiveUpdate {
    const until = this.run.t + seconds * 1000;

    while (this.run.t < until && this.run.step());

    const events = this.run.trace.slice(this.sentEvents);
    const said = this.run.said.slice(this.sentSaid);
    const done = this.run.done;

    this.sentEvents = this.run.trace.length;
    this.sentSaid = this.run.said.length;

    return { events, said, done, failures: done ? this.run.result().failures : [] };
  }
}
