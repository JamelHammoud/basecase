import type { AssemblyGeometry } from '../assembly/assemblyGeometry';
import { AXES } from '../assembly/moveBlockers';
import type { RemovalPlan, RemovalStep } from '../assembly/removalOrder';
import { teardownTo } from '../assembly/serviceDepth';
import { add, boxCenter, boxDiagonal, scale } from './guideMath';
import { prepareRepairInserts } from './repairInserts';
import { repairCallout, repairTools } from './repairItems';
import { provesReassembly } from './repairProof';
import { MAIN_MODULE, type Box, type GuidePlan, type GuideStep, type V3 } from './guideTypes';

export interface RepairGeometry {
  geometry: AssemblyGeometry;
  boxes: Record<string, Box>;
}

interface Context {
  plan: GuidePlan;
  geometry: AssemblyGeometry;
  boxes: Record<string, Box>;
  target: string;
  removed: Set<string>;
}

function directionOf(ctx: Context, step: RemovalStep): V3 {
  const g = ctx.geometry;
  const chain = g.chains.screws.find((screw) => step.ids.includes(screw.id));

  if (step.kind === 'screw' && chain) return chain.axis;

  const majors = step.ids.filter((id) => g.moves[id]);
  const clear = (id: string) => ctx.removed.has(id) || step.ids.includes(id) || !ctx.plan.partIds.includes(id);

  if (step.kind === 'unit') {
    return AXES.find((_, i) => majors.every((id) => !!g.moves[id].local[i] && g.moves[id].local[i].every(clear)))!;
  }

  const motion = g.moves[majors[0]];
  const paths = majors.includes(ctx.target) ? motion.exit! : motion.local;

  return motion.dirs[paths.findIndex((path) => path.every(clear))];
}

function removalStep(ctx: Context, step: RemovalStep): GuideStep {
  const partIds = step.ids.filter((id) => ctx.plan.partIds.includes(id));
  const shownIds = ctx.plan.partIds.filter((id) => !ctx.removed.has(id));
  const dir = directionOf(ctx, step);
  const distance = Math.max(20, ...partIds.map((id) => (ctx.boxes[id] ? boxDiagonal(ctx.boxes[id]) : 0)));
  const offset = scale(dir, distance);
  const callout = repairCallout(ctx.plan, partIds);
  const arrows: GuideStep['arrows'] = partIds.flatMap((id) => {
    const box = ctx.boxes[id];

    if (!box) return [];

    const from = boxCenter(box);

    return [{ from, to: add(from, offset), style: step.kind === 'screw' ? 'fastener' : 'part' }];
  });

  return {
    kind: 'build',
    number: 0,
    moduleId: MAIN_MODULE,
    partIds,
    contextIds: shownIds.filter((id) => !partIds.includes(id)),
    shownIds,
    moves: partIds.map((partId) => ({ partId, offset })),
    arrows,
    callout,
    tools: repairTools(ctx.plan, callout),
    repairPhase: 'remove',
  };
}

function swapStep(ctx: Context): GuideStep {
  const callout = repairCallout(ctx.plan, [ctx.target]);
  const shownIds = ctx.plan.partIds.filter((id) => !ctx.removed.has(id));

  return {
    kind: 'build',
    number: 0,
    moduleId: MAIN_MODULE,
    partIds: [ctx.target],
    contextIds: shownIds,
    shownIds,
    moves: [],
    arrows: [],
    callout,
    tools: [],
    repairPhase: 'swap',
  };
}

function reassembly(ctx: Context, removal: GuideStep[]): GuideStep[] {
  const restored = new Set<string>();
  const moved = new Map(removal.flatMap((step) => step.moves.map((move) => [move.partId, move] as const)));
  const carried = new Map(removal.map((step) => [step.partIds[0], step.partIds]));
  const steps: GuideStep[] = [];

  for (const source of ctx.plan.steps) {
    if (source.kind === 'inserts') continue;

    const partIds = [...new Set(source.partIds.flatMap((id) => carried.get(id) ?? []))].filter(
      (id) => !restored.has(id),
    );

    if (!partIds.length) continue;

    const contextIds = ctx.plan.partIds.filter((id) => !ctx.removed.has(id) || restored.has(id));
    const callout = repairCallout(ctx.plan, partIds);
    const arrows: GuideStep['arrows'] = partIds.flatMap((id) => {
      const box = ctx.boxes[id];
      const move = moved.get(id);

      if (!box || !move) return [];

      const to = boxCenter(box);

      return [{ from: add(to, move.offset), to, style: ctx.geometry.drivers[id] ? 'fastener' : 'part' }];
    });

    steps.push({
      ...source,
      partIds,
      contextIds,
      shownIds: [...contextIds, ...partIds],
      moves: partIds.flatMap((id) => (moved.has(id) ? [moved.get(id)!] : [])),
      arrows,
      callout,
      tools: repairTools(ctx.plan, callout),
      repairPhase: 'reassemble',
    });
    partIds.forEach((id) => restored.add(id));
  }

  return restored.size === ctx.removed.size ? steps : [];
}

export function buildRepairPlan(
  plan: GuidePlan,
  removal: RemovalPlan,
  targetId: string,
  measured: AssemblyGeometry | RepairGeometry,
): GuidePlan | null {
  const geometry = 'geometry' in measured ? measured.geometry : measured;
  const boxes = 'boxes' in measured ? measured.boxes : {};
  const item = plan.items.find((entry) => entry.partIds.includes(targetId));

  if (!item || !plan.partIds.includes(targetId)) return null;

  const selected = teardownTo(removal, targetId, geometry);

  if (!selected || [...selected].some((id) => !plan.partIds.includes(id))) return null;

  const ctx: Context = { plan, geometry, boxes, target: targetId, removed: new Set() };
  const actions = removal.steps.filter((step) => step.ids.some((id) => selected.has(id)));
  const removals = actions.map((step) => {
    const result = removalStep(ctx, step);

    result.partIds.forEach((id) => ctx.removed.add(id));

    return result;
  });
  const assembly = reassembly(ctx, removals);
  const preparation = item.kind === 'printed' ? prepareRepairInserts(ctx) : [];

  const proof = {
    geometry,
    target: targetId,
    removal: actions,
    initial: plan.partIds.filter((id) => !selected.has(id)),
  };

  if (!preparation || !assembly.length || assembly.some((step) => step.unproven) || !provesReassembly(proof, assembly))
    return null;

  return {
    ...plan,
    repair: { partId: targetId, printed: item.kind === 'printed' },
    steps: [...removals, swapStep(ctx), ...preparation, ...assembly].map((step, i) => ({ ...step, number: i + 1 })),
  };
}
