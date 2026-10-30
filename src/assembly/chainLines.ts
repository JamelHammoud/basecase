import { HOLES, isMetric, stockLengths } from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import type { ChainProblem, FastenerChain, SleeveHost } from './assemblyTypes';
import type { HeldBy } from './heldBy';
import { grouped, listIds, mm, type ReportLine } from './reportText';

export const RANK = {
  air: 1,
  uncut: 2,
  unseated: 3,
  sunk: 3,
  unheld: 4,
  orphan: 5,
  bottoms: 5,
  short: 6,
  stuck: 7,
  service: 8,
  split: 9,
  declared: 10,
  note: 11,
  tool: 12,
};

type ById = Map<string, ScenePart>;

function longerScrew(c: FastenerChain, part: ScenePart | undefined): string {
  const spec = part?.hardware;
  const missing = (c.needMm ?? 0) - c.engagementMm;

  if (!spec?.length) return `a screw ${Math.ceil(missing)} mm longer`;

  const want = spec.length + missing;
  const stock = stockLengths(spec).find((l) => l >= want);

  return `${spec.size} × ${stock ?? Math.ceil(want)}`;
}

function clearance(part: ScenePart | undefined) {
  const size = part?.hardware?.size;

  return size && isMetric(size) ? `Ø${HOLES[size].clearance}` : 'a clearance';
}

function problemKey(c: FastenerChain, p: ChainProblem, byId: ById): string {
  const self = byId.get(c.id);

  switch (p.code) {
    case 'air':
      return 'end in air with no insert, nut or material at the tip. Add an insert or nut there, or move the screw onto a hole that has one';
    case 'uncut':
      return `run ${mm(p.mm ?? 0)} through solid ${p.part}. Cut ${clearance(self)} mm clearance hole on the axis, or move the screw onto its hole`;
    case 'unseated':
      return 'have nothing under the head. Add a boss or counterbore floor under it, or move the screw onto its seat';
    case 'sunk':
      return `have their head buried in ${p.part}. Cut a counterbore for the head, or move the screw out to its seat`;
    case 'bottoms':
      return `run ${mm(p.mm ?? 0)} into ${p.part} past their insert. Use a screw ${Math.ceil((p.mm ?? 0) + 0.5)} mm shorter, or deepen the hole`;
    case 'short':
      return `engage ${mm(c.engagementMm)} of the ${mm(c.needMm ?? 0)} they need in ${c.endsIn.kind === 'insert' ? 'their insert' : (c.endsIn.id ?? 'the part')}. Use ${longerScrew(c, self)}`;
  }
}

export function chainLines(chains: FastenerChain[], byId: ById): ReportLine[] {
  const entries = chains.flatMap((c) =>
    c.problems.map((p) => ({ key: `${p.code}|${problemKey(c, p, byId)}`, id: c.id, rank: RANK[p.code] })),
  );

  const lines = grouped(entries, (key, ids) => `${listIds(ids)}: ${key.split('|')[1]}.`);

  return [...new Set(lines.map((l) => l.rank))].flatMap((rank) => collapse(lines.filter((l) => l.rank === rank)));
}

function collapse(lines: ReportLine[]): ReportLine[] {
  if (lines.length <= 2) return lines;

  const ids = lines.flatMap((l) => l.ids);
  const rest = lines.length - 2;

  return [
    {
      rank: lines[0].rank,
      text: `${lines[0].text} ${lines[1].text} The same for ${rest} more group${rest === 1 ? '' : 's'} (${ids.length} screws in all).`,
      ids,
    },
  ];
}

export function orphanLines(sleeves: SleeveHost[]): ReportLine[] {
  const ids = sleeves.filter((s) => s.kind === 'insert' && !s.screw).map((s) => s.id);

  return ids.length
    ? [
        {
          rank: RANK.orphan,
          text: `${listIds(ids)}: no screw threads into ${ids.length === 1 ? 'this insert' : 'these inserts'}. Add the screw, or remove the insert.`,
          ids,
        },
      ]
    : [];
}

export function heldLines(held: HeldBy): ReportLine[] {
  const out: ReportLine[] = [];

  if (held.unheld.length) {
    out.push({
      rank: RANK.unheld,
      text: `${listIds(held.unheld, 6)}: held by nothing (no fastener, press fit or pocket). Screw each to a boss through its mounting holes, or capture it in a pocket.`,
      ids: held.unheld,
    });
  }

  if (held.declared.length) {
    out.push({
      rank: RANK.declared,
      text: `${held.declared.map((d) => `${d.id} (${d.how})`).join(', ')}: held only by a note, unverified. Model the strap, tape or clip as a part, or a bay that captures it.`,
      ids: held.declared.map((d) => d.id),
    });
  }

  return out;
}
