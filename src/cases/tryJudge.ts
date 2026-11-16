import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { contractReads } from './contractReads';

export { contractReads } from './contractReads';

import { stageCase, stagedEffectors } from './caseCast';
import { robotFacts, slotRefusal } from './robotFit';
import { caseSlots, type Case, type ProbeEnd, type WorldObject } from './schema';
import { scoreTry, type TryScoring } from './tries';
import type { StoredTry } from './tryFile';

export const TIME_SIGNALS = new Set(['elapsed', 'timer']);

const fixedObject = (o: WorldObject | undefined) => !!o && o.behavior !== 'dynamic' && !o.movable;

const recordedEnd = (end: ProbeEnd, objects: WorldObject[]) =>
  typeof end === 'string' || !('object' in end) || fixedObject(objects.find((o) => o.id === end.object));

export function recordedOnly(kase: Case): boolean {
  const { probes, contract } = kase.task;
  const objects = kase.world.objects;
  const probed = new Set(probes.map((p) => p.signal));
  const endsRecorded = probes.every((p) => recordedEnd(p.from, objects) && recordedEnd(p.to, objects));

  return endsRecorded && [...contractReads(contract)].every((s) => probed.has(s) || TIME_SIGNALS.has(s));
}

const readsHand = (kase: Case) =>
  kase.task.probes.some((p) =>
    [p.from, p.to].some((end) => end === 'end-effector' || (typeof end === 'object' && 'effector' in end)),
  );

export interface JudgeRobot {
  rig: Rig;
  parts: ScenePart[];
}

function fits(kase: Case, robot: JudgeRobot, facts: ReturnType<typeof robotFacts>) {
  const slots = caseSlots(kase);

  if (slots.length !== 1 || !recordedOnly(kase) || slotRefusal(slots[0], facts)) return false;

  return !readsHand(kase) || stagedEffectors(stageCase(kase, robot, []), robot).effector !== null;
}

export function fittingCase(cases: Case[], robot: JudgeRobot): Case | null {
  const facts = robotFacts(robot.rig, robot.parts);

  return cases.find((kase) => fits(kase, robot, facts)) ?? null;
}

export async function judged(stored: StoredTry, scoring: TryScoring): Promise<StoredTry> {
  if (stored.outcome.verdict !== 'unjudged') return stored;

  const { passed, margin } = await scoreTry(scoring);

  return { ...stored, outcome: { verdict: passed ? 'passed' : 'failed', margin, by: 'contract' } };
}
