import type { SimModel } from '../sim/mjcfTypes';
import { errorMessage } from '../utils/errorMessage';
import type { BackgroundTask } from './kitPlan';
import type { ForgeRunner } from './forgeRunner';
import { runtimeForge } from './runtimeForge';
import { NO_SNAPSHOTS, withSnapshot, type SnapshotTrail } from './snapshots';
import type { Run, RuntimeDeps } from './skillsRuntimeTypes';
import type { SkillJob, SkillTarget } from './skillRows';

export abstract class SkillsRuntimeJobs {
  jobs: SkillJob[] = [];
  protected user: AbortController | null = null;
  protected userLabel = '';
  protected running: Promise<void> = Promise.resolve();
  protected background: AbortController | null = null;
  protected pending: { model: SimModel; tasks: BackgroundTask[] } | null = null;
  protected trails = new Map<SkillTarget, SnapshotTrail>();
  protected forgeErrors = new Map<SkillTarget, string>();
  protected deps: RuntimeDeps;

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
  }

  protected abstract refuse(target: SkillTarget, model: SimModel, state: { line: string; signal: AbortSignal }): void;
  protected abstract drainBackground(): Promise<void>;

  protected setJob(target: SkillTarget, patch: Partial<SkillJob> | null) {
    const others = this.jobs.filter((j) => j.target !== target);
    const current = this.jobs.find((j) => j.target === target);

    this.jobs = patch ? [...others, { ...(current as SkillJob), ...patch, target }] : others;
    this.deps.onChange([...this.jobs]);
  }

  protected forgeFor(run: Run, signal: AbortSignal): ForgeRunner {
    return runtimeForge({
      deps: this.deps,
      run,
      signal,
      setJob: (patch) => this.setJob(run.target, patch),
      snapshot: (ref) => {
        this.trails.set(run.target, withSnapshot(this.trails.get(run.target) ?? NO_SNAPSHOTS, ref));
        this.setJob(run.target, { snapshot: ref });
      },
      failed: (message) => {
        if (message === null) this.forgeErrors.delete(run.target);
        else this.forgeErrors.set(run.target, message);
      },
    });
  }

  protected async start(run: Run) {
    const controller = new AbortController();

    this.background?.abort();
    this.user = controller;
    this.userLabel = run.label;
    this.deps.onRefused?.(run.target, null);
    this.trails.set(run.target, NO_SNAPSHOTS);
    this.setJob(run.target, {
      label: run.label,
      background: false,
      share: null,
      message: run.message ?? 'Starting',
      snapshot: null,
    });

    try {
      if (run.model) this.deps.recovery?.observe(run.model);

      if (this.deps.recovery && (run.recoverable || run.recovered)) await this.deps.recovery.begin(run, run.recovered);

      await run.work(this.forgeFor(run, controller.signal), controller.signal);
    } catch (error) {
      if (run.model) this.refuse(run.target, run.model, { line: errorMessage(error), signal: controller.signal });

      controller.abort();
    } finally {
      await this.deps.recovery?.finish();
      this.user = null;
      this.forgeErrors.delete(run.target);
      this.trails.delete(run.target);
      this.setJob(run.target, null);
      void this.drainBackground();
    }
  }
}
