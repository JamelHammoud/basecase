import { isCover } from '../guide/guideOrder';
import type { ScenePart } from '../types/robotics';
import type { AssemblyGeometry, PartMoves } from './assemblyGeometry';
import type { SplitPlane } from './splitTest';
import { RANK } from './chainLines';
import type { RemovalPlan } from './removalOrder';
import { plural } from '../../electron/plural.mjs';
import { grouped, joinAnd, listIds, type ReportLine } from './reportText';
import { SERVICE_TARGET_STEPS, type ServiceResult } from './serviceDepth';

const PLANE_NAMES = { x: 'left/right', y: 'top/bottom', z: 'front/back' };

const screwsBy = (plan: RemovalPlan, verdict: string) =>
  Object.entries(plan.screws).filter(([, v]) => v.verdict === verdict);

function stuckLines(plan: RemovalPlan): ReportLine[] {
  const entries = screwsBy(plan, 'stuck').map(([id, v]) => ({
    key: v.verdict === 'stuck' ? v.blockers.slice(0, 3).join(', ') : '',
    id,
    rank: RANK.stuck,
    code: 'stuck-screw' as const,
  }));

  return grouped(entries, (key, ids) =>
    key
      ? `${listIds(ids)}: out of every driver’s reach, in any build order (in the way: ${key}). Turn each to face an opening, or cut a driver hole.`
      : `${listIds(ids)}: out of every driver’s reach, in any build order. Turn each to face an opening.`,
  ).slice(0, 2);
}

function stuckPartLine(plan: RemovalPlan, g: AssemblyGeometry): ReportLine[] {
  if (!plan.stuckParts.length) return [];

  const left = new Set(plan.stuckParts);
  const inTheWay = plan.stuckParts.flatMap((id) => {
    const ways = [...g.moves[id].local].sort((a, b) => a.length - b.length);

    return ways[0].filter((x) => left.has(x));
  });

  return [
    {
      rank: RANK.stuck,
      code: 'stuck-part',
      text: `${listIds(plan.stuckParts)} can’t go together or come apart in any order, with straight moves (in the way: ${listIds([...new Set(inTheWay)], 3)}). Widen the opening or split the part.`,
      ids: plan.stuckParts,
    },
  ];
}

function noteLine(plan: RemovalPlan): ReportLine[] {
  const notes = screwsBy(plan, 'note');

  if (!notes.length) return [];

  const groups = grouped(
    notes.map(([id, v]) => ({
      key: v.verdict === 'note' ? joinAnd(v.before.slice(0, 2)) : '',
      id,
      rank: RANK.note,
      code: 'order' as const,
    })),
    (key, ids) => `${listIds(ids, 2)} before ${key}`,
  );

  return [
    {
      rank: RANK.note,
      code: 'order',
      text: `Build notes: drive ${groups
        .slice(0, 2)
        .map((g) => g.text)
        .join(
          '; ',
        )}${groups.length > 2 ? `; and ${groups.length - 2} more` : ''}. Their heads are covered once those parts are on.`,
      ids: notes.map(([id]) => id),
    },
  ];
}

function toolLine(plan: RemovalPlan): ReportLine[] {
  const ids = screwsBy(plan, 'tool').map(([id]) => id);

  return ids.length
    ? [
        {
          rank: RANK.tool,
          code: 'tool',
          text: `Driving ${plural(ids.length, 'screw')} takes an L-key or ball-end driver: ${listIds(ids, 3)}. A straight driver line makes assembly easier.`,
          ids,
        },
      ]
    : [];
}

function serviceText(r: ServiceResult, target: number): string {
  if (r.steps === null) {
    return `${r.id} can’t come out of the robot (in the way: ${listIds(r.blockedBy, 3)}). Give it a bay or tray behind a cover`;
  }

  return `${r.id} takes ${plural(r.steps, 'step')} to replace (target ${target}), with ${listIds(r.partsOut, 3)} out first`;
}

export function serviceLines(results: ServiceResult[]): ReportLine[] {
  const over = results.filter((r) => r.steps === null || r.steps > SERVICE_TARGET_STEPS[r.cls]);
  const byClass = (['battery', 'electronics', 'servo'] as const).map((cls) => over.filter((r) => r.cls === cls));

  return byClass.flatMap((list) => {
    if (!list.length) return [];

    const worst = [...list].sort((a, b) => (b.steps ?? 1e9) - (a.steps ?? 1e9));
    const target = SERVICE_TARGET_STEPS[list[0].cls];
    const more = list.length > 2 ? ` (${list.length - 2} more like this)` : '';

    return [
      {
        rank: RANK.service,
        code: 'service',
        text: `Service: ${worst
          .slice(0, 2)
          .map((r) => serviceText(r, target))
          .join('; ')}${more}.`,
        ids: list.map((r) => r.id),
      },
    ];
  });
}

export function splitLines(
  splits: Record<string, SplitPlane[]>,
  byId: Map<string, ScenePart>,
  contents: (id: string) => string[],
): ReportLine[] {
  return Object.entries(splits).map(([id, planes]) => {
    const best = [...planes].sort((a, b) => a.blockers.flat().length - b.blockers.flat().length)[0];
    const inside = listIds(contents(id), 3);
    const part = byId.get(id);
    const text =
      part && isCover(part)
        ? `${id} wraps its contents (${inside}) and can’t come off: split it ${PLANE_NAMES[best.axis]} (the halves are blocked by ${plural(best.blockers[0].length, 'part')} and ${plural(best.blockers[1].length, 'part')}).`
        : `${id} encloses ${inside}: keep a load-bearing part whole and move them to a bay or tray outside it, or split it ${PLANE_NAMES[best.axis]} if it’s a cover.`;

    return { rank: RANK.split, code: 'split', text, ids: [id] };
  });
}

function hookedBy(m: PartMoves): string[] {
  const order = m.local.map((b, i) => ({ solid: b.length, lips: m.lips[i] })).sort((a, b) => a.solid - b.solid);
  const fewest = order.filter((o) => o.solid === order[0].solid);

  return [...fewest].sort((a, b) => a.lips.length - b.lips.length)[0]?.lips ?? [];
}

export function lipLines(g: AssemblyGeometry): ReportLine[] {
  const entries = Object.entries(g.moves).flatMap(([id, m]) => {
    const lips = hookedBy(m);

    return lips.length ? [{ key: lips.slice(0, 2).join(' and '), id, rank: RANK.lip, code: 'lip' as const }] : [];
  });

  return grouped(
    entries,
    (key, ids) =>
      `${listIds(ids, 3)} only comes off with a tilt or flex past ${key} (a hook or small lip). Check it by hand.`,
  ).slice(0, 2);
}

export function planLines(plan: RemovalPlan, g: AssemblyGeometry): ReportLine[] {
  return [...stuckPartLine(plan, g), ...stuckLines(plan), ...noteLine(plan), ...toolLine(plan)];
}
