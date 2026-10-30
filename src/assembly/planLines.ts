import { isCover } from '../guide/guideOrder';
import type { ScenePart } from '../types/robotics';
import type { SplitPlane } from './splitTest';
import { RANK } from './chainLines';
import type { RemovalPlan } from './removalOrder';
import { grouped, joinAnd, listIds, plural, type ReportLine } from './reportText';
import { SERVICE_TARGET_STEPS, type ServiceResult } from './serviceDepth';

const PLANE_NAMES = { x: 'left/right', y: 'top/bottom', z: 'front/back' };

const screwsBy = (plan: RemovalPlan, verdict: string) =>
  Object.entries(plan.screws).filter(([, v]) => v.verdict === verdict);

function stuckLines(plan: RemovalPlan): ReportLine[] {
  const entries = screwsBy(plan, 'stuck').map(([id, v]) => ({
    key: v.verdict === 'stuck' ? v.blockers.slice(0, 3).join(', ') : '',
    id,
    rank: RANK.stuck,
  }));

  return grouped(entries, (key, ids) =>
    key
      ? `${listIds(ids)}: no driver reaches them, in any build order (in the way: ${key}). Turn them to face an opening, or cut a driver hole.`
      : `${listIds(ids)}: no driver reaches them, in any build order. Turn them to face an opening.`,
  ).slice(0, 2);
}

function noteLine(plan: RemovalPlan): ReportLine[] {
  const notes = screwsBy(plan, 'note');

  if (!notes.length) return [];

  const groups = grouped(
    notes.map(([id, v]) => ({ key: v.verdict === 'note' ? joinAnd(v.before.slice(0, 2)) : '', id, rank: RANK.note })),
    (key, ids) => `${listIds(ids, 2)} before ${key}`,
  );

  return [
    {
      rank: RANK.note,
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
          text: `${plural(ids.length, 'screw')} need an L-key or ball-end driver: ${listIds(ids, 3)}. A straight driver line makes assembly easier.`,
          ids,
        },
      ]
    : [];
}

function serviceText(r: ServiceResult, target: number): string {
  if (r.steps === null) {
    return `${r.id} can't come out of the robot (in the way: ${listIds(r.blockedBy, 3)}). Give it a bay or tray behind a cover`;
  }

  return `${r.id} takes ${r.steps} steps to replace (target ${target}): ${listIds(r.partsOut, 3)} come out first`;
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
        ? `${id} wraps its contents (${inside}) and can't come off: split it ${PLANE_NAMES[best.axis]} (the halves are blocked by ${best.blockers[0].length} and ${best.blockers[1].length} parts).`
        : `${id} encloses ${inside}: keep a load-bearing part whole and move them to a bay or tray outside it, or split it ${PLANE_NAMES[best.axis]} if it's a cover.`;

    return { rank: RANK.split, text, ids: [id] };
  });
}

export function planLines(plan: RemovalPlan): ReportLine[] {
  return [...stuckLines(plan), ...noteLine(plan), ...toolLine(plan)];
}
