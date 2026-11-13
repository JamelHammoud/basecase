import type { FaultKind, Rect } from './faults';

export const PERSONA_BARS = Object.freeze({ faults: 30, sessions: 10, recall: 0.8, precision: 0.5, slackPx: 8 });

export interface Finding {
  where: string;
  at?: [number, number];
  problem: string;
}

export interface PlantedFault {
  session: number;
  kind: FaultKind;
  name: string;
  rect: Rect | null;
  seen?: Rect[];
}

export interface SessionFindings {
  session: number;
  findings: Finding[];
}

const inside = (at: [number, number] | undefined, r: Rect | null, slack: number) =>
  !!at &&
  !!r &&
  at[0] >= r.x - slack &&
  at[0] <= r.x + r.width + slack &&
  at[1] >= r.y - slack &&
  at[1] <= r.y + r.height + slack;

const squashed = (text: string) => text.toLowerCase().replace(/\s+/g, '');

const names = (f: Finding, fault: PlantedFault) => squashed(f.where).includes(squashed(fault.name));

const placed = (f: Finding, fault: PlantedFault) =>
  [fault.rect, ...(fault.seen ?? [])].some((r) => inside(f.at, r, PERSONA_BARS.slackPx));

export const matches = (f: Finding, fault: PlantedFault) => names(f, fault) || placed(f, fault);

export interface PersonaScore {
  recall: number;
  precision: number;
  caught: number;
  findings: number;
  problems: string[];
}

export function personaScore(faults: PlantedFault[], sessions: SessionFindings[]): PersonaScore {
  const caught = faults.filter((fault) =>
    sessions.some((s) => s.session === fault.session && s.findings.some((f) => matches(f, fault))),
  ).length;
  const all = sessions.flatMap((s) => s.findings.map((f) => ({ f, session: s.session })));
  const useful = all.filter(({ f, session }) => faults.some((fault) => fault.session === session && matches(f, fault)));
  const recall = faults.length ? caught / faults.length : 0;
  const precision = all.length ? useful.length / all.length : 0;
  const problems: string[] = [];

  if (faults.length < PERSONA_BARS.faults)
    problems.push(`Planted ${faults.length} faults, needs ${PERSONA_BARS.faults}`);

  if (recall < PERSONA_BARS.recall)
    problems.push(`Recall ${caught} of ${faults.length}, needs ${PERSONA_BARS.recall * 100}%`);

  if (precision < PERSONA_BARS.precision)
    problems.push(`Precision ${useful.length} of ${all.length} findings, needs ${PERSONA_BARS.precision * 100}%`);

  return { recall, precision, caught, findings: all.length, problems };
}
