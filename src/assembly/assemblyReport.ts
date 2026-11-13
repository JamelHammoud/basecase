import { hardwareDrive } from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import type { AssemblyGeometry } from './assemblyGeometry';
import { chainLines, heldLines, isBlockingRank, orphanLines, RANK } from './chainLines';
import { heldBy } from './heldBy';
import { lipLines, planLines, serviceLines, splitLines } from './planLines';
import { planRemoval, type RemovalPlan } from './removalOrder';
import { plural } from '../../electron/plural.mjs';
import type { ReportLine } from './reportText';
import { serviceClass, serviceDepths, type ServiceResult } from './serviceDepth';

export const MAX_LINES = 12;

export interface AssemblyReport {
  text: string;
  lines: ReportLine[];
  plan: RemovalPlan;
  service: ServiceResult[];
  enclosing: string[];
}

export const serviceableIds = (parts: ScenePart[]) => parts.filter((p) => serviceClass(p)).map((p) => p.id);

function toolOf(byId: Map<string, ScenePart>) {
  return (id: string) => {
    const h = byId.get(id)?.hardware;

    return h ? `${h.size} ${hardwareDrive(h) ?? h.type}` : id;
  };
}

function summary(g: AssemblyGeometry, plan: RemovalPlan): string {
  const majors = Object.keys(g.moves).length;
  const screws = g.chains.screws.length;
  const out = Object.values(plan.screws).filter((v) => v.verdict !== 'stuck').length;
  const sleeves = g.chains.sleeves.filter((s) => s.kind !== 'washer').length;
  const head = `Checked ${plural(screws, 'screw')}, ${plural(sleeves, 'insert or nut', 'inserts and nuts')}, and ${plural(majors, 'part')} in ${(g.ms / 1000).toFixed(1)} s.`;
  const order = majors
    ? ` Taking it apart: ${majors - plan.stuckParts.length} of ${plural(majors, 'part')} and ${out} of ${plural(screws, 'screw')} come out.`
    : '';
  const late = g.timedOut ? ' Stopped at the time limit, so the order and service rows are partial.' : '';

  return head + order + late;
}

const TIMED_OUT: ReportLine = {
  rank: RANK.stuck,
  code: 'unfinished',
  text: 'Stopped at the time limit, so build order, loose parts, repairs and insert walls are partly unchecked. Run the check again.',
  ids: [],
};

function capped(lines: ReportLine[]): string[] {
  const sorted = [...lines].sort((a, b) => a.rank - b.rank);

  const row = (l: ReportLine) => `- ${isBlockingRank(l.rank) ? 'BLOCKER: ' : ''}${l.text}`;

  if (sorted.length <= MAX_LINES) return sorted.map(row);

  return [
    ...sorted.slice(0, MAX_LINES - 1).map(row),
    `- …and ${sorted.length - MAX_LINES + 1} more lines; fix these and run it again.`,
  ];
}

export function assemblyReport(parts: ScenePart[], g: AssemblyGeometry): AssemblyReport {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const groups = Object.fromEntries(parts.map((p) => [p.id, p.group?.id]));
  const plan = planRemoval(g, groups);
  const service = serviceDepths(parts, g, toolOf(byId), plan);
  const lines = [
    ...chainLines(g.chains.screws, byId),
    ...orphanLines(g.chains.sleeves),
    ...heldLines(heldBy(parts, g)),
    ...planLines(plan, g),
    ...lipLines(g),
    ...serviceLines(service),
    ...splitLines(g.splits, byId, (id) => g.moves[id]?.contents ?? []),
    ...(g.timedOut ? [TIMED_OUT] : []),
  ];
  const body = lines.length
    ? ['Findings (the ones get_readiness counts as blockers are marked BLOCKER):', ...capped(lines)]
    : ['No assembly problems found.'];

  const enclosing = Object.keys(g.splits);

  return { text: [summary(g, plan), ...body].join('\n'), lines, plan, service, enclosing };
}
