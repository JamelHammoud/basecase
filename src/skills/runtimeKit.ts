import type { SimModel } from '../sim/mjcfTypes';
import type { ForgeRunner } from './forgeRunner';
import { observeInstall, type InstallCompleted } from './installRun';
import type { TrainedEntry } from './kitEnvironment';
import type { KitWarm } from './motorKit';
import type { RuntimeDeps } from './skillsRuntimeTypes';
import { localKitWarm } from './localKitSource';
import { measuredKitMapping } from './localKitScope';

export function runRuntimeKit(options: {
  model: SimModel;
  entry: TrainedEntry;
  ports: { forge: ForgeRunner; signal: AbortSignal; warm?: KitWarm };
  completed?: InstallCompleted;
  infrastructure: () => boolean;
  assertCurrent?: () => void;
  deps: Pick<RuntimeDeps, 'runner' | 'save' | 'kitContext' | 'kitSources' | 'loadSkill' | 'prepareKitWarm'>;
}) {
  const { model, entry, ports, completed, infrastructure, deps } = options;
  const { warm: explicit, ...rest } = ports;

  return observeInstall({
    signal: ports.signal,
    completed,
    infrastructure,
    work: async () => {
      const warm =
        explicit ??
        (entry === 'stand'
          ? await localKitWarm({
              model,
              entry,
              records: deps.kitSources?.() ?? [],
              load: deps.loadSkill,
              signal: ports.signal,
              admit: measuredKitMapping,
              prepare: deps.prepareKitWarm,
              available: ports.forge.canWarm,
            })
          : undefined);
      const context = deps.kitContext ? await deps.kitContext(model) : {};

      if (ports.signal.aborted) throw new Error('Stopped.');

      options.assertCurrent?.();

      const reply = await deps.runner(
        { type: 'kit', model, design: model.robots[0]?.key ?? 'scene', entry, ...context, ...(warm ? { warm } : {}) },
        { save: deps.save, ...rest },
      );

      return reply.outcome;
    },
  });
}
