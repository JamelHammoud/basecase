import type { SimModel } from '../sim/mjcfTypes';
import type { WorkspaceRequest } from './armWorkspace';
import type { ArmMotionInput } from './armMotion';
import type { ReplyTo, SkillsJob } from './skillsJob';
import { inSkillsWorker, STOPPED, type SkillRunner } from './skillsClient';

export class ArmWorkspaceSession {
  private controller: AbortController | null = null;
  private readonly runner: SkillRunner;

  constructor(runner: SkillRunner = inSkillsWorker) {
    this.runner = runner;
  }

  cancel() {
    this.controller?.abort();
    this.controller = null;
  }

  async sample(model: SimModel, request: Omit<WorkspaceRequest, 'stop'>) {
    return (await this.run({ type: 'workspace', model, request })).samples;
  }

  async plan(model: SimModel, request: Omit<ArmMotionInput, 'stop'>) {
    return (await this.run({ type: 'workspace-motion', model, request })).result;
  }

  private async run<K extends 'workspace' | 'workspace-motion'>(
    job: Extract<SkillsJob, { type: K }>,
  ): Promise<ReplyTo<K>> {
    this.cancel();

    const controller = new AbortController();

    this.controller = controller;

    const reply = await this.runner(job, {
      signal: controller.signal,
      forge: async () => {
        throw new Error('Workspace sampling has no training job.');
      },
      save: async () => {
        throw new Error('Workspace sampling saves no skill.');
      },
    });

    if (controller.signal.aborted || this.controller !== controller) throw new Error(STOPPED);

    return reply;
  }
}
