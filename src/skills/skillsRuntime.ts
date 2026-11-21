import type { HandoffResult } from '../routines/handoffTraining';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { ArenaEvidence, Skill } from './artifacts';
import { type ForgeRunner } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import type { KitOutcome, KitWarm } from './motorKit';
import { errorMessage } from '../utils/errorMessage';
import type { BackgroundTask } from './kitPlan';
import type { InstallCompleted } from './installRun';
import { runRuntimeKit } from './runtimeKit';
import type { ForgeFactory, JobRow, KitInstall, RaceReport, Run, RuntimeDeps } from './skillsRuntimeTypes';
import type { SkillPorts, SkillsJob } from './skillsJob';
import { SkillCoach } from './skillsCoach';
import { SkillStress } from './skillsStress';
import { refusedLine, skillRecord, type SkillRecord } from './skillRecords';
import { KIT_LABELS, refusalModel, type SkillTarget } from './skillRows';
import { NO_SNAPSHOT_STORE, NO_SNAPSHOTS, trailRefs, type SnapshotRef, type Snapshots } from './snapshots';
import type { DraftInput, DraftReport, DraftResult } from './teach';
import { runTaughtRace } from './runtimeRace';
import type { Environment } from './environment';
import { recoverableWorker, seededRecoveryJob, type RecoveryTriesPorts } from './recoverSkill';
import { recoveredRun } from './recoveredRun';
import { SkillsRuntimeJobs } from './skillsRuntimeJobs';
import { runMoveWork } from './runtimeMove';
import { DESIGN_CHANGED, type RecoverableSkillJob } from './skillRecovery';
import { runRuntimeRecheck } from './runtimeRecheck';
import { runTries, type TriesPlan } from './triesRun';

export type { ForgeFactory, ForgeFactoryOptions, JobRow } from './skillsRuntimeTypes';
export type { KitInstall, RaceReport, RuntimeDeps } from './skillsRuntimeTypes';

export const designOf = (model: SimModel) => model.robots[0]?.key ?? 'scene';

const refused = (reason: string): HandoffResult => ({ skill: null, proof: null, reason });

const BUSY = 'Training is running. Check list_skills, or wait for it to finish.';

export class SkillsRuntime extends SkillsRuntimeJobs {
  lastRace: RaceReport | null = null;
  private drafts = new Map<string, DraftReport>();
  private draftRevisions = new WeakMap<DraftReport, number>();
  private recoveryTries?: RecoveryTriesPorts;
  private designRevision = 0;

  readonly coach: SkillCoach;
  readonly stress: SkillStress;

  constructor(deps: RuntimeDeps) {
    super(deps);
    this.deps = {
      ...deps,
      onRecord: (record) => {
        deps.recovery?.assertCurrent();
        deps.onRecord(record);
      },
      runner: (async (job, ports) => {
        const request = seededRecoveryJob(job, deps.recovery?.key);

        if (this.user && deps.recovery && recoverableWorker(job.type))
          await deps.recovery.capture({ type: 'worker', job: request as RecoverableSkillJob });

        deps.recovery?.assertCurrent();

        return deps.runner(request, { ...ports, localSalt: deps.recovery?.judgmentSalt });
      }) as RuntimeDeps['runner'],
    };
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
      onStress: (target, report) => this.deps.onStress?.(target, report),
    });
  }

  invalidateRecovery() {
    this.designRevision += 1;
    this.deps.recovery?.invalidate();

    if (this.jobs.some((job) => job.target.startsWith('goal:'))) this.user?.abort();
  }

  setRecoveryContext(context: string) {
    if (this.deps.recovery) this.deps.recovery.context = context;
  }

  setRecoveryTries(ports: RecoveryTriesPorts) {
    this.recoveryTries = ports;
  }

  async recover(model: SimModel) {
    this.deps.recovery?.observe(model);

    if (!this.deps.recovery || this.user) return;

    const run = await recoveredRun({
      model,
      recovery: this.deps.recovery,
      tries: this.recoveryTries,
      deps: this.deps,
      keep: (target, record) => this.keep(target, record),
      refuse: (target, line, signal) => this.refuse(target, model, { line, signal }),
    });

    if (run && !this.user) this.running = this.start(run);
  }

  loadSkill(hash: string) {
    return this.deps.loadSkill(hash);
  }

  setKitContext(context: NonNullable<RuntimeDeps['kitContext']>) {
    this.deps.kitContext = context;
  }

  setKitSources(sources: NonNullable<RuntimeDeps['kitSources']>) {
    this.deps.kitSources = sources;
  }

  startJob(row: JobRow, work: (ports: SkillPorts) => Promise<void>): string | null {
    if (this.user) return BUSY;

    const progress = (share: number) => this.setJob(row.target, { share });

    this.running = this.start({
      ...row,
      background: false,
      work: (forge, signal) => work({ ...this.ports(), forge, signal, progress }),
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
    const revision = this.designRevision;
    const reply = await this.deps.runner({ type: 'draft', model, design: designOf(model), request }, this.ports());

    if (revision !== this.designRevision) return { ok: false, problems: [DESIGN_CHANGED] };

    if (reply.result.ok) this.drafts.set(reply.result.report.draft.id, reply.result.report);

    if (reply.result.ok) this.draftRevisions.set(reply.result.report, revision);

    return reply.result;
  }

  async twin(model: SimModel, skill: Skill, environment: Environment): Promise<ArenaEvidence> {
    const reply = await this.deps.runner({ type: 'twin', model, skill, environment }, this.ports());

    return reply.evidence;
  }

  trainKit(model: SimModel, entry: TrainedEntry): string | null {
    return this.installKit(model, { entry });
  }

  installKit(model: SimModel, install: Omit<KitInstall, 'warm'> & { warm?: KitWarm }): string | null {
    if (this.user) return BUSY;

    const revision = this.designRevision;

    this.running = this.start({
      recoverable: true,
      target: `kit:${install.entry}`,
      label: KIT_LABELS[install.entry],
      background: false,
      model,
      work: (forge, signal) =>
        this.kitWork(model, install.entry, { forge, signal, warm: install.warm, revision }, install.onOutcome),
    });

    return null;
  }

  trainMove(model: SimModel, animation: RobotAnimation): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      recoverable: true,
      target: `move:${animation.id}`,
      label: animation.name,
      background: false,
      model,
      work: (forge, signal) => this.moveWork(model, animation, { forge, signal }),
    });

    return null;
  }

  recheck(model: SimModel, task: BackgroundTask): string | null {
    if (this.user) return BUSY;

    const revision = this.designRevision;

    this.running = this.start({
      target: task.target,
      label: task.label,
      background: false,
      model,
      work: (forge, signal) => this.recheckWork(model, task, { forge, signal, revision }),
    });

    return null;
  }

  learnFromTries(plan: TriesPlan): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      recoverable: true,
      target: `goal:${plan.kase.name}`,
      label: plan.kase.name,
      model: plan.model,
      background: false,
      work: async (forge) => {
        await this.deps.recovery?.capture({
          type: 'tries',
          model: plan.model,
          kase: plan.kase,
          job: plan.job,
          datasetId: plan.datasetId,
        });

        return runTries(plan, {
          forge,
          design: designOf(plan.model),
          save: this.deps.save,
          onRecord: this.deps.onRecord,
        }).catch((e: unknown) => plan.done({ runs: null, kept: false, problem: errorMessage(e) }));
      },
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
    const revision = this.designRevision;

    if (this.draftRevisions.get(report) !== revision) return DESIGN_CHANGED;

    this.running = this.start({
      recoverable: true,
      target: `goal:${draft.name}`,
      label: draft.request || draft.name,
      background: false,
      model,
      work: async (forge, signal) => {
        await runTaughtRace({
          model,
          report,
          budgetSteps,
          runner: this.deps.runner,
          ports: { ...this.ports(), forge, signal },
          assertCurrent: () => this.assertDesignCurrent(revision, signal),
          keep: (target, record, assertCurrent) => this.keep(target, record, assertCurrent),
          onRace: (result) => {
            this.lastRace = result;
          },
        });
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
    this.deps.recovery?.preserve();
    this.user?.abort('detach');
    this.background?.abort();
    this.pending = null;
  }

  private ports() {
    const failForge: ForgeRunner = () => Promise.reject(new Error('This step trains nothing.'));

    return { forge: failForge, save: this.deps.save };
  }

  private async keep(target: SkillTarget, record: SkillRecord, assertCurrent?: () => void) {
    const refs = trailRefs(this.trails.get(target) ?? NO_SNAPSHOTS);
    const kept = refs.length ? await (this.deps.snapshots ?? NO_SNAPSHOT_STORE).keep(record.hash, refs) : [];

    assertCurrent?.();
    this.deps.onRecord(kept.length ? { ...record, snapshots: kept } : record);
  }

  private async kitWork(
    model: SimModel,
    entry: TrainedEntry,
    ports: { forge: ForgeRunner; signal: AbortSignal; warm?: KitWarm; revision?: number },
    completed?: InstallCompleted,
  ) {
    const revision = ports.revision ?? this.designRevision;
    const assertCurrent = () => this.assertDesignCurrent(revision, ports.signal);
    const outcome = await runRuntimeKit({
      model,
      entry,
      ports: { forge: ports.forge, signal: ports.signal, warm: ports.warm },
      completed,
      infrastructure: () => this.forgeErrors.has(`kit:${entry}`),
      deps: this.deps,
      assertCurrent,
    });

    const target: SkillTarget = `kit:${entry}`;

    if (outcome.kind === 'skill')
      return this.keep(target, skillRecord(outcome.skill, { kit: entry, model }), assertCurrent);

    const line = outcome.validation ? outcome.reason : this.refusalLine(target, outcome);

    this.refuse(target, model, { line, signal: ports.signal });
  }

  private refusalLine(target: SkillTarget, outcome: Extract<KitOutcome, { kind: 'refused' }>) {
    return outcome.evidence ? refusedLine(outcome.evidence) : (this.forgeErrors.get(target) ?? outcome.reason);
  }

  private async moveWork(
    model: SimModel,
    animation: RobotAnimation,
    ports: { forge: ForgeRunner; signal: AbortSignal },
  ) {
    return runMoveWork({
      model,
      animation,
      ports,
      deps: this.deps,
      error: () => this.forgeErrors.get(`move:${animation.id}`),
      keep: (target, record) => this.keep(target, record),
      refuse: (target, line) => this.refuse(target, model, { line, signal: ports.signal }),
    });
  }

  protected refuse(target: SkillTarget, model: SimModel, { line, signal }: { line: string; signal: AbortSignal }) {
    if (!signal.aborted) this.deps.onRefused?.(target, { line, model: refusalModel(model) });
  }

  private retrain(
    model: SimModel,
    task: BackgroundTask,
    ports: { forge: ForgeRunner; signal: AbortSignal; revision?: number },
  ) {
    if (task.move) return this.moveWork(model, task.move, ports);

    return task.entry ? this.kitWork(model, task.entry, ports) : Promise.resolve();
  }

  private assertDesignCurrent(revision: number, signal: AbortSignal) {
    signal.throwIfAborted();

    if (revision !== this.designRevision) throw new Error(DESIGN_CHANGED);
  }

  private recheckWork(
    model: SimModel,
    task: BackgroundTask,
    ports: { forge: ForgeRunner; signal: AbortSignal; revision?: number },
  ) {
    const revision = ports.revision ?? this.designRevision;
    const assertCurrent = () => this.assertDesignCurrent(revision, ports.signal);

    return runRuntimeRecheck({
      model,
      task,
      ports: { ...this.ports(), ...ports },
      deps: this.deps,
      assertCurrent,
      retrain: () => this.retrain(model, task, { ...ports, revision }),
      keep: (record) => this.keep(task.target, record, assertCurrent),
    });
  }

  protected async drainBackground() {
    while (this.pending?.tasks.length && !this.user) {
      const { model, tasks } = this.pending;
      const task = tasks[0];
      const controller = new AbortController();
      const run: Run = {
        target: task.target,
        label: task.label,
        background: true,
        work: (forge, signal) =>
          task.kind === 'recheck'
            ? this.recheckWork(model, task, { forge, signal })
            : this.retrain(model, task, { forge, signal }),
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
