import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { ForgeRunner } from './forgeRunner';
import { moveTag, skillRecord, type SkillRecord } from './skillRecords';
import type { RuntimeDeps } from './skillsRuntimeTypes';
import type { SkillTarget } from './skillRows';

export async function runMoveWork(options: {
  model: SimModel;
  animation: RobotAnimation;
  ports: { forge: ForgeRunner; signal: AbortSignal };
  deps: RuntimeDeps;
  error?: string;
  keep: (target: SkillTarget, record: SkillRecord) => Promise<void>;
  refuse: (target: SkillTarget, line: string) => void;
}) {
  const { model, animation, ports, deps, error, keep, refuse } = options;
  const reply = await deps.runner(
    { type: 'move', model, design: model.robots[0]?.key ?? 'scene', animation },
    { save: deps.save, ...ports },
  );
  const { outcome, environment } = reply.outcome;
  const target: SkillTarget = `move:${animation.id}`;

  if (outcome.kind === 'skill')
    return keep(target, skillRecord(outcome.skill, { kit: null, move: moveTag(animation.id, environment) }));

  refuse(target, error ?? outcome.reason);
}
