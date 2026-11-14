import type { MainModule } from '@mujoco/mujoco';
import { calibratedModel } from '../sim/calibratedModel';
import type { SimModel } from '../sim/mjcfTypes';
import { runArena } from '../skills/arena';
import type { ArenaEvidence, Skill } from '../skills/artifacts';
import type { Environment } from '../skills/environment';
import { arenaLine, refusedLine, worstVariant, type SkillRecord } from '../skills/skillRecords';

export interface TwinVerdict {
  unit: string;
  passes: number;
  trials: number;
  passed: boolean;
  line: string;
}

export interface TwinInput {
  mj: MainModule;
  model: SimModel;
  skill: Pick<Skill, 'controller'>;
  environment: Environment;
  salt?: Uint8Array;
}

export const twinModel = calibratedModel;

export const proveOnTwin = ({ mj, model, skill, environment, salt }: TwinInput): Promise<ArenaEvidence> =>
  runArena({
    mj,
    model,
    contract: environment.contract,
    controller: skill.controller,
    environment,
    ...(salt ? { salt } : {}),
  });

function mostFailed(failures: Record<string, number>): string | null {
  const ranked = Object.entries(failures)
    .filter(([, count]) => count > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b));

  return ranked[0]?.[0] ?? null;
}

export function twinVerdict(unit: string, evidence: ArenaEvidence): TwinVerdict {
  const worst = worstVariant(evidence);
  const counts = { passes: worst?.passes ?? 0, trials: worst?.trials ?? 0 };

  if (evidence.passed) return { unit, ...counts, passed: true, line: arenaLine(evidence) };

  const label = worst ? mostFailed(worst.failures) : null;

  return { unit, ...counts, passed: false, line: label ?? refusedLine(evidence) };
}

export const withTwins = (records: SkillRecord[], hash: string, verdicts: Record<string, TwinVerdict>): SkillRecord[] =>
  records.map((r) => (r.hash === hash ? { ...r, twins: { ...r.twins, ...verdicts } } : r));
