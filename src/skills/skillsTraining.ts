import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Skill } from './artifacts';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import type { BackgroundTask } from './kitPlan';
import type { KitWarm } from './motorKit';
import type { SkillRunner } from './skillsClient';
import { moveTag, recordEnvironment, refusedLine, skillRecord, type SkillRecord } from './skillRecords';
import type { SkillTarget } from './skillRows';

export interface TrainingHost {
  runner: SkillRunner;
  loadSkill: (hash: string) => Promise<Skill | null>;
  ports: () => { forge: ForgeRunner; save: SkillSave };
  keep: (target: SkillTarget, record: SkillRecord) => Promise<void>;
  forgeError: (target: SkillTarget) => string | undefined;
  refuse: (target: SkillTarget, model: SimModel, refusal: { line: string; signal: AbortSignal }) => void;
}

export interface TrainingPorts {
  forge: ForgeRunner;
  signal: AbortSignal;
}

export const designOf = (model: SimModel) => model.robots[0]?.key ?? 'scene';

export async function kitWork(
  host: TrainingHost,
  { model, entry }: { model: SimModel; entry: TrainedEntry },
  ports: TrainingPorts & { warm?: KitWarm },
) {
  const { warm, ...rest } = ports;
  const reply = await host.runner(
    { type: 'kit', model, design: designOf(model), entry, ...(warm ? { warm } : {}) },
    { ...host.ports(), ...rest },
  );
  const { outcome } = reply;

  const target: SkillTarget = `kit:${entry}`;

  if (outcome.kind === 'skill') return host.keep(target, skillRecord(outcome.skill, { kit: entry }));

  const line = outcome.evidence ? refusedLine(outcome.evidence) : (host.forgeError(target) ?? outcome.reason);

  host.refuse(target, model, { line, signal: ports.signal });
}

export async function moveWork(
  host: TrainingHost,
  { model, animation }: { model: SimModel; animation: RobotAnimation },
  ports: TrainingPorts,
) {
  const reply = await host.runner(
    { type: 'move', model, design: designOf(model), animation },
    { ...host.ports(), ...ports },
  );
  const { outcome, environment } = reply.outcome;
  const target: SkillTarget = `move:${animation.id}`;

  if (outcome.kind === 'skill')
    return host.keep(target, skillRecord(outcome.skill, { kit: null, move: moveTag(animation.id, environment) }));

  host.refuse(target, model, { line: host.forgeError(target) ?? outcome.reason, signal: ports.signal });
}

function retrain(host: TrainingHost, { model, task }: { model: SimModel; task: BackgroundTask }, ports: TrainingPorts) {
  if (task.move) return moveWork(host, { model, animation: task.move }, ports);

  return task.entry ? kitWork(host, { model, entry: task.entry }, ports) : Promise.resolve();
}

export async function recheckWork(
  host: TrainingHost,
  { model, task }: { model: SimModel; task: BackgroundTask },
  ports: TrainingPorts,
) {
  const skill = await host.loadSkill(task.record.hash);
  const environment = recordEnvironment(task.record, model, task.move ? [task.move] : []);

  if (!skill || !environment) return retrain(host, { model, task }, ports);

  const job = { type: 'recheck' as const, model, design: designOf(model), skill, environment };
  const reply = await host.runner(job, { ...host.ports(), ...ports });

  if (!reply.skill) return retrain(host, { model, task }, ports);

  const move = task.move ? moveTag(task.move.id, environment) : undefined;

  await host.keep(
    task.target,
    skillRecord(reply.skill, { kit: task.entry, move, coach: task.record.coach ?? undefined }),
  );
}

export function backgroundWork(
  host: TrainingHost,
  { model, task }: { model: SimModel; task: BackgroundTask },
  ports: TrainingPorts,
) {
  return task.kind === 'recheck' ? recheckWork(host, { model, task }, ports) : retrain(host, { model, task }, ports);
}
