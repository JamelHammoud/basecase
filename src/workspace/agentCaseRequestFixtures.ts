import { buildCase, builderRobot, type CaseSpec } from '../cases/caseBuilder';
import { compileCaseLogic } from '../cases/caseLogic';
import type { Case } from '../cases/schema';
import type { Room } from '../cases/roomPlan';
import type { Routine } from '../routines/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { ProjectSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { CASE_HANDLERS } from './agentCaseRequests';
import type { Cases } from './useCases';

export const scene = { parts: () => [], project: () => ({}) as ProjectSettings, viewport: () => null };

export const robotOf = (id: string) => {
  const r = fixtureRobots().find((f) => f.id === id)!;

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

export function contextFor(id: string, room?: Room) {
  const robot = robotOf(id);
  const added: Case[] = [];
  const inRoom = (spec: CaseSpec): CaseSpec => (room ? { ...spec, room } : spec);
  const cases = {
    builder: {
      preview: (spec: CaseSpec) => buildCase(inRoom(spec), robot),
      add: (spec: CaseSpec) => {
        const built = buildCase(inRoom(spec), robot);

        if (built.ok) added.push(built.kase);

        return built;
      },
    },
  } as unknown as Cases;
  const routines = { checkLogic: async (logic: unknown) => compileCaseLogic(logic as Routine, { skills: [] }) };

  const caseCompare = { choicesFor: () => [], compareNow: async () => null as never, start: () => {} };
  const running: string[] = [];
  const caseRun = { enterCase: (caseId: string) => void running.push(caseId) };

  const caseExplore = { explore: async () => 'unused' };

  return { ctx: { cases, routines, caseCompare, caseExplore, caseRun, setAction: () => {}, ...scene }, added, running };
}

export const create = (payload: Record<string, unknown>, id = 'rover-diff', room?: Room) => {
  const { ctx, added, running } = contextFor(id, room);

  return { reply: CASE_HANDLERS.create_case(payload, ctx), added, running };
};

export const logicForSkill = (skill: string): Routine => ({
  schema: 1,
  id: 'cheer',
  name: 'Cheer',
  requires: ['wheels'],
  base: { kind: 'do', id: 'start', skill, holds: ['body'], timeoutMs: 10000, onTimeout: [], onFail: [] },
  watchers: [{ id: 'goal-count', model: 'case-fact', rateHz: 10, maxAgeMs: 500, publishes: { type: 'number' } }],
  reactions: [],
  safeStop: skill,
});
