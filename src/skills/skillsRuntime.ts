import type { HandoffResult } from '../routines/handoffTraining';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Case } from '../cases/schema';
import type { CaseRuns } from '../cases/caseRuns';
import type { PolicySpec } from '../sim/policy';
import { skillFiles, skillHash, type Skill } from './artifacts';
import { lastError, type ForgeJob, type ForgeRunner, type SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import { errorMessage } from '../utils/errorMessage';
import type { BackgroundTask } from './kitPlan';
import type { RaceOutcome } from './race';
import type { SkillRunner } from './skillsClient';
import type { SkillsJob } from './skillsJob';
import { moveTag, recordEnvironment, skillRecord, type SkillRecord } from './skillRecords';
import { KIT_LABELS, type SkillJob, type SkillTarget } from './skillRows';
import type { DraftInput, DraftReport, DraftResult } from './teach';
import { raceSummary } from './teach';
import type { ForgeProgress } from './trainerForge';
import { triesSkill } from './triesTraining';

export interface ForgeFactory {
  (options: { background: boolean; onProgress: (p: ForgeProgress) => void; signal: AbortSignal }): ForgeRunner;
}

export interface RuntimeDeps {
  runner: SkillRunner;
  forge: ForgeFactory;
  save: SkillSave;
  loadSkill: (hash: string) => Promise<Skill | null>;
  onRecord: (record: SkillRecord) => void;
  onChange: (jobs: SkillJob[]) => void;
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
  background: boolean;
  work: (forge: ForgeRunner, signal: AbortSignal) => Promise<void>;
}

export interface TriesPlan {
  model: SimModel;
  kase: Case;
  job: ForgeJob;
  judge: (policy: PolicySpec) => Promise<TriesVerdict>;
  done: (outcome: TriesOutcome) => void;
}

export interface TriesVerdict {
  runs: CaseRuns;
  robotModel: string;
}

export interface TriesOutcome {
  runs: CaseRuns | null;
  kept: boolean;
  problem: string | null;
}

export const designOf = (model: SimModel) => model.robots[0]?.key ?? 'scene';

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

  private deps: RuntimeDeps;

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
  }

  get busy() {
    return !!this.user;
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
      work: (forge, signal) => this.kitWork(model, entry, { forge, signal }),
    });

    return null;
  }

  trainMove(model: SimModel, animation: RobotAnimation): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      target: `move:${animation.id}`,
      label: animation.name,
      background: false,
      work: (forge, signal) => this.moveWork(model, animation, { forge, signal }),
    });

    return null;
  }

  recheck(model: SimModel, task: BackgroundTask): string | null {
    if (this.user) return BUSY;

    this.running = this.start({
      target: task.target,
      label: task.label,
      background: false,
      work: (forge, signal) => this.recheckWork(model, task, { forge, signal }),
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
        this.triesWork(plan, forge).catch((e: unknown) =>
          plan.done({ runs: null, kept: false, problem: errorMessage(e) }),
        ),
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

  replaceForge(forge: ForgeFactory) {
    this.deps = { ...this.deps, forge };
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

        this.finishRace(report, reply.outcome);
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

  private finishRace(report: DraftReport, outcome: RaceOutcome) {
    const { draft } = report;

    if (outcome.kind === 'skill')
      this.deps.onRecord(
        skillRecord(outcome.skill, { kit: null, goal: draft.request, environment: draft.environment }),
      );

    this.lastRace = {
      name: draft.name,
      found: outcome.kind === 'skill',
      lines: raceSummary(outcome),
      relaxation: outcome.kind === 'skill' ? null : report.relaxation,
    };
  }

  private async triesWork(plan: TriesPlan, forge: ForgeRunner) {
    const startedAt = Date.now();
    const outcome = await forge(plan.job);
    const policy = outcome.ok ? outcome.policy : null;

    if (!policy) return plan.done({ runs: null, kept: false, problem: lastError(outcome) });

    const verdict = await plan.judge(policy).catch((e: unknown) => errorMessage(e));

    if (typeof verdict === 'string') return plan.done({ runs: null, kept: false, problem: verdict });

    const { runs } = verdict;
    const cost = { wallS: (Date.now() - startedAt) / 1000, steps: policy.trainedSteps };
    const { model, kase } = plan;
    const design = designOf(model);
    const made = triesSkill({ model, design, kase, policy, runs, origin: { method: 'ask-for-demo', cost } });

    if (made) {
      await this.deps.save(skillFiles(skillHash(made.skill)).skill, JSON.stringify(made.skill));
      this.deps.onRecord(
        skillRecord(made.skill, {
          kit: null,
          goal: kase.name,
          environment: made.environment,
          case: { id: kase.id, model: verdict.robotModel },
        }),
      );
    }

    plan.done({ runs, kept: !!made, problem: runs.refusal });
  }

  private async kitWork(model: SimModel, entry: TrainedEntry, ports: { forge: ForgeRunner; signal: AbortSignal }) {
    const reply = await this.deps.runner(
      { type: 'kit', model, design: designOf(model), entry },
      { ...this.ports(), ...ports },
    );

    if (reply.outcome.kind === 'skill') this.deps.onRecord(skillRecord(reply.outcome.skill, { kit: entry }));
  }

  private async moveWork(
    model: SimModel,
    animation: RobotAnimation,
    ports: { forge: ForgeRunner; signal: AbortSignal },
  ) {
    const reply = await this.deps.runner(
      { type: 'move', model, design: designOf(model), animation },
      { ...this.ports(), ...ports },
    );
    const { outcome, environment } = reply.outcome;

    if (outcome.kind === 'skill')
      this.deps.onRecord(skillRecord(outcome.skill, { kit: null, move: moveTag(animation.id, environment) }));
  }

  private retrain(model: SimModel, task: BackgroundTask, ports: { forge: ForgeRunner; signal: AbortSignal }) {
    if (task.move) return this.moveWork(model, task.move, ports);

    return task.entry ? this.kitWork(model, task.entry, ports) : Promise.resolve();
  }

  private async recheckWork(model: SimModel, task: BackgroundTask, ports: { forge: ForgeRunner; signal: AbortSignal }) {
    const skill = await this.deps.loadSkill(task.record.hash);
    const environment = recordEnvironment(task.record, model, task.move ? [task.move] : []);

    if (!skill || !environment) return this.retrain(model, task, ports);

    const job = { type: 'recheck' as const, model, design: designOf(model), skill, environment };
    const reply = await this.deps.runner(job, { ...this.ports(), ...ports });

    if (!reply.skill) return this.retrain(model, task, ports);

    const move = task.move ? moveTag(task.move.id, environment) : undefined;

    this.deps.onRecord(skillRecord(reply.skill, { kit: task.entry, move }));
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
    });

    return async (job) => {
      this.setJob(run.target, { message: 'Starting', share: null });

      const outcome = await forge(job);

      this.setJob(run.target, { message: 'Checking in Arena', share: null });

      return outcome;
    };
  }

  private async start(run: Run) {
    const controller = new AbortController();

    this.background?.abort();
    this.user = controller;
    this.userLabel = run.label;
    this.setJob(run.target, { label: run.label, background: false, share: null, message: 'Starting' });

    try {
      await run.work(this.forgeFor(run, controller.signal), controller.signal);
    } catch {
      controller.abort();
    } finally {
      this.user = null;
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
        work: (forge, signal) =>
          task.kind === 'recheck'
            ? this.recheckWork(model, task, { forge, signal })
            : this.retrain(model, task, { forge, signal }),
      };

      this.background = controller;
      this.setJob(run.target, { label: task.label, background: true, share: null, message: 'Starting' });

      try {
        await run.work(this.forgeFor(run, controller.signal), controller.signal);
      } catch {
        controller.abort();
      }

      this.setJob(run.target, null);

      if (controller.signal.aborted) return;

      tasks.shift();
    }
  }
}
