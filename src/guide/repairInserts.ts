import type { AssemblyGeometry } from '../assembly/assemblyGeometry';
import { add, boxCenter, boxDiagonal, normalize, scale } from './guideMath';
import { repairCallout, repairTools } from './repairItems';
import type { Box, GuidePlan, GuideStep } from './guideTypes';

interface Preparation {
  plan: GuidePlan;
  geometry: AssemblyGeometry;
  boxes: Record<string, Box>;
  target: string;
}

function insertMotion(input: Preparation, id: string) {
  const source = input.plan.steps.find((step) => step.kind === 'inserts' && step.partIds.includes(id));
  const sourceMove = source?.moves.find((move) => move.partId === id);
  const sleeve = input.geometry.chains.sleeves.find((entry) => entry.id === id)!;
  const screw = input.geometry.chains.screws.find((chain) => chain.id === sleeve.screw);
  const direction = screw?.axis ?? sourceMove?.offset;
  const box = input.boxes[id];

  if (!direction || !box) return null;

  const distance = sourceMove ? Math.hypot(...sourceMove.offset) : Math.max(8, boxDiagonal(box) * 1.6);
  const offset = scale(normalize(direction), distance);
  const to = boxCenter(box);

  return {
    move: { partId: id, offset },
    arrow: { from: add(to, offset), to, style: 'fastener' as const },
  };
}

export function prepareRepairInserts(input: Preparation): GuideStep[] | null {
  const ids = input.geometry.chains.sleeves
    .filter((sleeve) => sleeve.kind === 'insert' && sleeve.host === input.target)
    .map((sleeve) => sleeve.id);

  if (!ids.length) return [];

  if (ids.some((id) => !input.plan.partIds.includes(id))) return null;

  const motions = ids.map((id) => insertMotion(input, id));

  if (motions.some((motion) => !motion)) return null;

  const ready = motions.filter((motion) => motion !== null);
  const contextIds = [input.target];
  const source = input.plan.steps.find((step) => step.partIds.includes(ids[0]));
  const callout = repairCallout(input.plan, ids, true);

  return [
    {
      kind: 'inserts',
      number: 0,
      moduleId: source?.moduleId ?? 'main',
      partIds: ids,
      contextIds,
      shownIds: [...contextIds, ...ids],
      moves: ready.map((motion) => motion.move),
      arrows: ready.map((motion) => motion.arrow),
      callout,
      tools: repairTools(input.plan, callout),
      repairPhase: 'reassemble',
    },
  ];
}
