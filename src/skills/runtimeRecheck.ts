import type { SimModel } from '../sim/mjcfTypes';
import type { BackgroundTask } from './kitPlan';
import { moveTag, recordEnvironment, skillRecord, type SkillRecord } from './skillRecords';
import type { SkillPorts } from './skillsJob';
import type { RuntimeDeps } from './skillsRuntimeTypes';

export async function runRuntimeRecheck(options: {
  model: SimModel;
  task: BackgroundTask;
  ports: SkillPorts;
  deps: Pick<RuntimeDeps, 'loadSkill' | 'runner'>;
  assertCurrent: () => void;
  retrain: () => Promise<void>;
  keep: (record: SkillRecord) => Promise<void>;
}) {
  const { model, task, ports, deps, assertCurrent, retrain, keep } = options;
  const skill = await deps.loadSkill(task.record.hash);

  assertCurrent();

  const environment = recordEnvironment(task.record, model, task.move ? [task.move] : []);

  if (!skill || !environment) return retrain();

  const job = { type: 'recheck' as const, model, design: model.robots[0]?.key ?? 'scene', skill, environment };
  const reply = await deps.runner(job, ports);

  assertCurrent();

  if (!reply.skill) return retrain();

  const move = task.move ? moveTag(task.move.id, environment) : undefined;

  await keep(skillRecord(reply.skill, { kit: task.entry, move, coach: task.record.coach ?? undefined, model }));
}
