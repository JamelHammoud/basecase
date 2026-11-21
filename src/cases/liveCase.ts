import type { VisionResult } from '../vision/types';
import type { Controller, SimEngine } from '../sim/engine';
import { torqueShare } from '../sim/torqueShare';
import { framePoses, type Recording } from '../sim/recorder';
import { NO_BODY, routineBody } from '../routines/physicsBody';
import type { RoutineKit } from '../routines/physicsKit';
import type { Plan } from '../routines/planTypes';
import type { RobotJoint } from '../types/robotics';
import { caseFactReader, caseSignalNames, sampleSignals, type CaseFactReader, type CaseFacts } from './caseFacts';
import { CaseLogicRun, judgeSoFar, usesBodySkills } from './caseLogic';
import { caseSlots, type Case } from './schema';

export interface LiveCaseInput {
  kase: Case;
  plan: Plan | null;
  joints: RobotJoint[];
  kit: RoutineKit | null;
}

const STEP_S = 0.02;
const JUDGE_EVERY_S = 0.25;

export class LiveCase {
  private readonly engine: SimEngine;
  private readonly kase: Case;
  private readonly reader: CaseFactReader;
  private readonly names: Set<string>;
  private readonly signals: Record<string, number[]> = {};
  private readonly logic: CaseLogicRun | null;
  private latest: CaseFacts = {};
  private judging = false;
  private judgedAt = 0;
  private t = 0;
  private owed = 0;
  private readonly startedAt: number;

  private constructor(engine: SimEngine, kase: Case, logic: CaseLogicRun | null, startedAt = engine.data.time) {
    this.engine = engine;
    this.startedAt = startedAt;
    this.kase = kase;
    this.logic = logic;
    engine.world.startPeople();
    this.reader = caseFactReader(kase, engine.sim);
    this.names = caseSignalNames(kase);
  }

  static async start(engine: SimEngine, input: LiveCaseInput, drive: () => Controller): Promise<LiveCase> {
    const { kase, plan, kit } = input;

    if (!plan) return new LiveCase(engine, kase, null);

    const options = { skills: kit?.policies ?? [], drive: kit?.drive };
    const body = usesBodySkills(plan) ? routineBody(engine.sim, input.joints, options) : null;

    if (usesBodySkills(plan) && !body) throw new Error(NO_BODY);

    const handBack = () => engine.setController(drive());
    const logic = await CaseLogicRun.start({ plan, seconds: kase.task.seconds, engine, body, handBack });

    return new LiveCase(engine, kase, logic);
  }

  static resume(
    engine: SimEngine,
    input: { kase: Case; recording: Recording; branch: { frame: number }; started: number; deadline: number },
  ): LiveCase {
    const { kase, recording, branch, started, deadline } = input;
    const live = new LiveCase(engine, kase, null, deadline - kase.task.seconds);

    for (let frame = 0; frame <= branch.frame; frame++) {
      const elapsed = started + recording.t[frame] - live.startedAt;
      const read = live.reader.read(framePoses(recording, frame), elapsed, recording.torque?.[frame]);

      sampleSignals(read, live.names, live.signals);
      live.latest = { ...live.latest, ...read };
    }

    live.t = engine.data.time - live.startedAt;
    live.judge();

    return live;
  }

  get facts(): CaseFacts {
    return { ...this.latest, ...this.logic?.cameraFacts() };
  }

  get driving(): boolean {
    return this.logic?.driving ?? true;
  }

  continuationSource(): Case | null {
    if (this.logic || caseSlots(this.kase).length !== 1) return null;

    if (this.kase.console?.panels.some((panel) => panel.kind === 'code')) return null;

    return this.kase.console?.input.includes('code') ? null : this.kase;
  }

  get continuationDeadline(): number {
    return this.startedAt + this.kase.task.seconds;
  }

  acceptVision(result: VisionResult, ageMs = 0) {
    this.logic?.acceptVision(result, ageMs);
  }

  input(name: string, value: CaseFacts[string]) {
    this.logic?.input({ at: this.t, name, value });
  }

  advance(seconds: number, beforeStep?: () => void) {
    this.owed += seconds;

    while (this.owed >= STEP_S - 1e-9) {
      beforeStep?.();

      const read = this.reader.read(this.engine.poses(), this.t, torqueShare(this.engine));

      sampleSignals({ ...read, ...this.logic?.cameraFacts() }, this.names, this.signals);
      this.logic?.advance(this.t * 1000, read);
      this.latest = { ...this.latest, ...read };
      this.engine.step(STEP_S);
      this.t += STEP_S;
      this.owed -= STEP_S;
    }

    this.judge();
  }

  private judge() {
    if (this.judging || this.t - this.judgedAt < JUDGE_EVERY_S) return;

    this.judging = true;
    this.judgedAt = this.t;
    void judgeSoFar(this.kase.task.contract, { dt: STEP_S, signals: this.signals }).then((verdict) => {
      this.logic?.judged(verdict);
      this.latest = { ...this.latest, ...verdict };
      this.judging = false;
    });
  }
}
