import type { SimModel } from '../sim/mjcfTypes';
import { recoverSkill, type RecoveryTriesPorts } from './recoverSkill';
import { ChangedRecovery, type SkillRecovery } from './skillRecovery';
import type { RuntimeDeps, Run } from './skillsRuntimeTypes';
import type { SkillRecord } from './skillRecords';
import type { SkillTarget } from './skillRows';

export async function recoveredRun(options: {
  model: SimModel;
  recovery: SkillRecovery;
  tries?: RecoveryTriesPorts;
  deps: RuntimeDeps;
  keep: (target: SkillTarget, record: SkillRecord) => Promise<void>;
  refuse: (target: SkillTarget, line: string, signal: AbortSignal) => void;
}): Promise<Run | null> {
  const { model, recovery, tries, deps, keep, refuse } = options;
  const entry = await recovery.load(model).catch(async (error: unknown) => {
    if (error instanceof ChangedRecovery) {
      refuse(error.entry.target, error.message, new AbortController().signal);
      await recovery.discard();
    }

    return null;
  });

  if (!entry || (entry.request.type === 'tries' && !tries)) return null;

  return {
    ...entry,
    model,
    background: false,
    recovered: entry,
    work: async (forge, signal) => {
      const result = await recoverSkill({ entry, ports: { forge, signal, save: deps.save }, deps, tries });

      if (typeof result === 'string') return refuse(entry.target, result, signal);

      if (result) await keep(entry.target, result);
    },
  };
}
