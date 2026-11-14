import type { HandoffResult } from '../routines/handoffTraining';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Skill } from './artifacts';
import { lastError, type ForgeRunner, type SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import type { KitWarm } from './motorKit';
import { errorMessage } from '../utils/errorMessage';
import type { BackgroundTask } from './kitPlan';
import type { RaceOutcome } from './race';
import type { SkillRunner } from './skillsClient';
import type { SkillPorts, SkillsJob } from './skillsJob';
import { SkillCoach } from './skillsCoach';
import { SkillStress } from './skillsStress';
import type { StressResult } from './stress';
import { skillRecord, type SkillRecord } from './skillRecords';
import { KIT_LABELS, refusalModel, type SkillJob, type SkillRefusal, type SkillTarget } from './skillRows';
import {
  NO_SNAPSHOT_STORE,
  NO_SNAPSHOTS,
  trailRefs,
  withSnapshot,
  type SnapshotRef,
  type Snapshots,
  type SnapshotTrail,
} from './snapshots';
import type { DraftInput, DraftReport, DraftResult } from './teach';
import { raceSummary } from './teach';
import type { ForgeProgress } from './trainerForge';
import type { Environment } from './environment';
import { runTries, type TriesPlan } from './triesRun';
import { backgroundWork, designOf, kitWork, moveWork, recheckWork, type TrainingHost } from './skillsTraining';

export { designOf };

export interface ForgeFactoryOptions {
  background: boolean;
  onProgress: (p: ForgeProgress) => void;
  onSnapshot?: (ref: SnapshotRef) => void;
  signal: AbortSignal;
}

export type ForgeFactory = (options: ForgeFactoryOptions) => ForgeRunner;

export interface RuntimeDeps {
  runner: SkillRunner;
  forge: ForgeFactory;
  save: SkillSave;
  loadSkill: (hash: string) => Promise<Skill | null>;
  onRecord: (record: SkillRecord) => void;
  onChange: (jobs: SkillJob[]) => void;
  onRefused?: (target: SkillTarget, refusal: SkillRefusal | null) => void;
  onStressed?: (result: StressResult) => void;
  snapshots?: Snapshots;
}

export interface KitInstall {
  entry: TrainedEntry;
  warm: KitWarm;
}

export interface RaceReport {
  name: string;
  found: boolean;
  lines: string[];
  relaxation: string | null;
}

interface Run {
  target: SkillTarget;
  label: string;
  message?: string;
  background: boolean;
  model?: SimModel;
  work: (forge: ForgeRunner, signal: AbortSignal) => Promise<void>;
}

const refused = (reason: string): HandoffResult => ({ skill: null, proof: null, reason });

const BUSY = 'Training is running. Check list_skills, or wait for it to finish.';

export class SkillsRuntime {
  jobs: SkillJob[] = [];
  lastRace: RaceReport | null = null;
  private drafts = new Map<string, DraftReport>();
  private user: AbortController | null = null;
  private userLabel = '';
  private running: Promise<void> = Promise.resolve();
  private background: AbortController | null = null;
  private pending: { model: SimModel; tasks: BackgroundTask[] } | null = null;
  private trails = new Map<SkillTarget, SnapshotTrail>();
  private forgeErrors = new Map<SkillTarget, string>();

  private deps: RuntimeDeps;
  readonly coach: SkillCoach;
  readonly stress: SkillStress;

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
    this.coach = new SkillCoach({
      runner: deps.runner,
      ports: () => this.ports(),
      startJob: (row, work) => this.startJob(row, work),
      keep: (target, record) => this.keep(target, record),
    });
    this.stress = new SkillStress({
      runner: deps.runner,
      startJob: (row, work) => this.startJob(row, work),
      keep: (target, record) => this.keep(target, record),
      onStressed: (result) => this.deps.onStressed?.(result),
      onRefused: (target, refusal) => this.deps.onRefused?.(target, refusal),
    });
  }

  loadSkill(hash: string) {
    return this.deps.loadSkill(hash);
  }

  startJob(
    row: { target: SkillTarget; label: string; message?: string },
    work: (ports: SkillPorts) => Promise<void>,
  ): string | null {
    if (this.user) return BUSY;

    const onProgress = (share: number) => this.setJob(row.target, { share });

    this.running = this.start({
      ...row,
      background: false,
      work: (forge, signal) => work({ ...this.ports(), forge, signal, onProgress }),
    });

    return null;
  }

  get busy() {
    return !!this.user;
  }

  get training(): string | null {
    return this.user ? this.userLabel : null;
  }

  draftOf(id: string) {
    return this.drafts.get(id) ?? null;
  }

  async draft(model: SimModel, request: DraftInput): Promise<DraftResult> {
    const reply = await this.deps.runner({ type: 'draft', model, design: designOf(model), request }, this.ports());

    if (reply.result.ok) this.drafts.set(reply.result.report.draft.id, reply.result.report);

    return reply.result;
  }

  trainKit(model: SimModel, entry: TrainedEntry): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      target: `kit:${entry}`,
      label: KIT_LABELS[entry],
      background: false,
      model,
      work: (forge, signal) => kitWork(this.host(), { model, entry }, { forge, signal }),
    });

    return null;
  }

  installKit(model: SimModel, install: KitInstall): string | null {
    if (this.user) return BUSY;

    const { entry, warm } = install;

    this.running = this.start({
      target: `kit:${entry}`,
      label: KIT_LABELS[entry],
      background: false,
      model,
      work: (forge, signal) => kitWork(this.host(), { model, entry }, { forge, signal, warm }),
    });

    return null;
  }

  trainMove(model: SimModel, animation: RobotAnimation): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      target: `move:${animation.id}`,
      label: animation.name,
      background: false,
      model,
      work: (forge, signal) => moveWork(this.host(), { model, animation }, { forge, signal }),
    });

    return null;
  }

  recheck(model: SimModel, task: BackgroundTask): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      target: task.target,
      label: task.label,
      background: false,
      model,
      work: (forge, signal) => recheckWork(this.host(), { model, task }, { forge, signal }),
    });

    return null;
  }

  learnFromTries(plan: TriesPlan): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      target: `goal:${plan.kase.name}`,
      label: plan.kase.name,
      background: false,
      work: (forge) =>
        runTries(plan, {
          forge,
          design: designOf(plan.model),
          save: this.deps.save,
          onRecord: this.deps.onRecord,
        }).catch((e: unknown) => plan.done({ runs: null, kept: false, problem: errorMessage(e) })),
    });

    return null;
  }

  async trainHandoff(
    job: Omit<Extract<SkillsJob, { type: 'handoff' }>, 'type'>,
    row: { target: SkillTarget; label: string },
  ): Promise<HandoffResult | null> {
    if (this.user) return refused(`${this.userLabel} is training.`);

    let result: HandoffResult | null = null;

    this.running = this.start({
      ...row,
      background: false,
      work: async (forge, signal) => {
        try {
          const reply = await this.deps.runner({ type: 'handoff', ...job }, { ...this.ports(), forge, signal });

          result = reply.result;
        } catch (error) {
          if (!signal.aborted) result = refused(errorMessage(error));

          throw error;
        }
      },
    });
    await this.running;

    return result;
  }

  replaceForge(forge: ForgeFactory, snapshots?: Snapshots) {
    this.deps = { ...this.deps, forge, ...(snapshots ? { snapshots } : {}) };
  }

  loadSnapshot(ref: SnapshotRef, skill?: string) {
    return (this.deps.snapshots ?? NO_SNAPSHOT_STORE).load(ref, skill);
  }

  environmentOf(target: SkillTarget): Environment | null {
    const report = [...this.drafts.values()].find((r) => `goal:${r.draft.name}` === target);

    return report?.draft.environment ?? null;
  }

  race(model: SimModel, draftId: string, budgetSteps?: number): string | null {
    const report = this.drafts.get(draftId);

    if (!report) return 'No draft with that id. Draft the skill again with draft_skill.';

    if (this.user) return BUSY;

    const { draft } = report;

    this.running = this.start({
      target: `goal:${draft.name}`,
      label: draft.request || draft.name,
      background: false,
      work: async (forge, signal) => {
        const reply = await this.deps.runner(
          { type: 'race', model, draft, budgetSteps },
          { ...this.ports(), forge, signal },
        );

        await this.finishRace(report, reply.outcome);
      },
    });

    return null;
  }

  settled(): Promise<void> {
    return this.running;
  }

  stopUser() {
    this.user?.abort();
  }

  planBackground(model: SimModel, tasks: BackgroundTask[]) {
    this.background?.abort();
    this.pending = tasks.length ? { model, tasks } : null;
    void this.drainBackground();
  }

  dispose() {
    this.user?.abort();
    this.background?.abort();
    this.pending = null;
  }

  private ports() {
    const failForge: ForgeRunner = () => Promise.reject(new Error('This step trains nothing.'));

    return { forge: failForge, save: this.deps.save };
  }

  private host(): TrainingHost {
    return {
      runner: this.deps.runner,
      loadSkill: this.deps.loadSkill,
      ports: () => this.ports(),
      keep: (target, record) => this.keep(target, record),
      forgeError: (target) => this.forgeErrors.get(target),
      refuse: (target, model, refusal) => this.refuse(target, model, refusal),
    };
  }

  private async keep(target: SkillTarget, record: SkillRecord) {
    const refs = trailRefs(this.trails.get(target) ?? NO_SNAPSHOTS);
    const kept = refs.length ? await (this.deps.snapshots ?? NO_SNAPSHOT_STORE).keep(record.hash, refs) : [];

    this.deps.onRecord(kept.length ? { ...record, snapshots: kept } : record);
  }

  private async finishRace(report: DraftReport, outcome: RaceOutcome) {
    const { draft } = report;

    if (outcome.kind === 'skill')
      await this.keep(
        `goal:${draft.name}`,
        skillRecord(outcome.skill, { kit: null, goal: draft.request, environment: draft.environment }),
      );

    this.lastRace = {
      name: draft.name,
      found: outcome.kind === 'skill',
      lines: raceSummary(outcome),
      relaxation: outcome.kind === 'skill' ? null : report.relaxation,
    };
  }

  private refuse(target: SkillTarget, model: SimModel, { line, signal }: { line: string; signal: AbortSignal }) {
    if (!signal.aborted) this.deps.onRefused?.(target, { line, model: refusalModel(model) });
  }

  private setJob(target: SkillTarget, patch: Partial<SkillJob> | null) {
    const others = this.jobs.filter((j) => j.target !== target);
    const current = this.jobs.find((j) => j.target === target);

    this.jobs = patch ? [...others, { ...(current as SkillJob), ...patch, target }] : others;
    this.deps.onChange([...this.jobs]);
  }

  private forgeFor(run: Run, signal: AbortSignal): ForgeRunner {
    const forge = this.deps.forge({
      background: run.background,
      signal,
      onProgress: (p) => this.setJob(run.target, { share: p.share, message: p.message }),
      onSnapshot: (ref) => {
        this.trails.set(run.target, withSnapshot(this.trails.get(run.target) ?? NO_SNAPSHOTS, ref));
        this.setJob(run.target, { snapshot: ref });
      },
    });

    return async (job) => {
      this.setJob(run.target, { message: 'Starting', share: null });

      const outcome = await forge(job);

      if (outcome.ok) this.forgeErrors.delete(run.target);
      else if (!signal.aborted) this.forgeErrors.set(run.target, lastError(outcome));

      this.setJob(run.target, { message: 'Checking in Arena', share: null });

      return outcome;
    };
  }

  private async start(run: Run) {
    const controller = new AbortController();

    this.background?.abort();
    this.user = controller;
    this.userLabel = run.label;
    this.deps.onRefused?.(run.target, null);
    this.trails.set(run.target, NO_SNAPSHOTS);

    const message = run.message ?? 'Starting';

    this.setJob(run.target, { label: run.label, background: false, share: null, message, snapshot: null });

    try {
      await run.work(this.forgeFor(run, controller.signal), controller.signal);
    } catch (error) {
      if (run.model) this.refuse(run.target, run.model, { line: errorMessage(error), signal: controller.signal });

      controller.abort();
    } finally {
      this.user = null;
      this.forgeErrors.delete(run.target);
      this.trails.delete(run.target);
      this.setJob(run.target, null);
      void this.drainBackground();
    }
  }

  private async drainBackground() {
    while (this.pending?.tasks.length && !this.user) {
      const { model, tasks } = this.pending;
      const task = tasks[0];
      const controller = new AbortController();
      const run: Run = {
        target: task.target,
        label: task.label,
        background: true,
        work: (forge, signal) => backgroundWork(this.host(), { model, task }, { forge, signal }),
      };

      this.background = controller;
      this.trails.set(run.target, NO_SNAPSHOTS);
      this.setJob(run.target, {
        label: task.label,
        background: true,
        share: null,
        message: 'Starting',
        snapshot: null,
      });

      try {
        await run.work(this.forgeFor(run, controller.signal), controller.signal);
      } catch {
        controller.abort();
      }

      this.forgeErrors.delete(run.target);
      this.trails.delete(run.target);
      this.setJob(run.target, null);

      if (controller.signal.aborted) return;

      tasks.shift();
    }
  }
}
