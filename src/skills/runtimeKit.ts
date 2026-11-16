import type { SimModel } from '../sim/mjcfTypes';
import type { ForgeRunner } from './forgeRunner';
import { observeInstall, type InstallCompleted } from './installRun';
import type { TrainedEntry } from './kitEnvironment';
import type { KitWarm } from './motorKit';
import type { RuntimeDeps } from './skillsRuntimeTypes';

export function runRuntimeKit(options: {
  model: SimModel;
  entry: TrainedEntry;
  ports: { forge: ForgeRunner; signal: AbortSignal; warm?: KitWarm };
  completed?: InstallCompleted;
  infrastructure: () => boolean;
  deps: Pick<RuntimeDeps, 'runner' | 'save' | 'kitContext'>;
}) {
  const { model, entry, ports, completed, infrastructure, deps } = options;
  const { warm, ...rest } = ports;

  return observeInstall({
    signal: ports.signal,
    completed,
    infrastructure,
    work: async () => {
      const context = deps.kitContext ? await deps.kitContext(model) : {};

      if (ports.signal.aborted) throw new Error('Stopped.');

      const reply = await deps.runner(
        { type: 'kit', model, design: model.robots[0]?.key ?? 'scene', entry, ...context, ...(warm ? { warm } : {}) },
        { save: deps.save, ...rest },
      );

      return reply.outcome;
    },
  });
}
