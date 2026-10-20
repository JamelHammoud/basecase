import { add, boxCenter, clamp, dot, extentAlong, normalize, scale, snapAxis, sub, unionBox } from './guideMath';
import { isFastener, isInsert } from './guideItems';
import { boxOfPart, touching, type PlanContext } from './guideOrder';
import type { Box, GuideArrow, GuideMove, GuideStep, V3 } from './guideTypes';

const HEADED = new Set(['socket_head', 'button_head', 'countersunk', 'pan_head', 'hex_bolt', 'standoff_mf']);

interface Explosion {
  moves: GuideMove[];
  arrows: GuideArrow[];
}

const boxOf = (ctx: PlanContext, ids: string[]) => unionBox(ids.map((id) => boxOfPart(ctx, id)));

function seatCenter(ctx: PlanContext, id: string, among: Set<string>): V3 | null {
  const seats = touching(ctx, id).filter((o) => among.has(o) && !isFastener(ctx.byId.get(o)!));

  return seats.length ? boxCenter(boxOf(ctx, seats)) : null;
}

function fastenerDirection(ctx: PlanContext, id: string, among: Set<string>): V3 {
  const axis = normalize(ctx.axes[id] ?? [0, 1, 0]);
  const type = ctx.byId.get(id)?.hardware?.type ?? '';
  const seat = seatCenter(ctx, id, among);

  if (HEADED.has(type) || !seat) return axis;

  return dot(sub(boxCenter(boxOfPart(ctx, id)), seat), axis) >= 0 ? axis : scale(axis, -1);
}

function fastenerMove(ctx: PlanContext, id: string, among: Set<string>): Explosion {
  const box = boxOfPart(ctx, id);
  const dir = fastenerDirection(ctx, id, among);
  const length = ctx.byId.get(id)?.dimensions.height ?? extentAlong(box, dir);
  const offset = scale(dir, length * 1.6 + clamp(ctx.size * 0.03, 4, 18));
  const center = boxCenter(box);

  return {
    moves: [{ partId: id, offset }],
    arrows: [
      {
        from: add(add(center, offset), scale(dir, -length / 2)),
        to: add(center, scale(dir, length * 0.45)),
        style: 'fastener',
      },
    ],
  };
}

function blockMove(ctx: PlanContext, ids: string[], seat: V3, spread: number): Explosion {
  const box: Box = boxOf(ctx, ids);
  const center = boxCenter(box);
  const dir = snapAxis(sub(center, seat));
  const extent = extentAlong(box, dir);
  const distance = clamp(extent * 0.45 + ctx.size * spread, 10, ctx.size * 0.45);
  const offset = scale(dir, distance);
  const lead = add(center, scale(dir, -extent / 2));

  return {
    moves: ids.map((partId) => ({ partId, offset })),
    arrows: [{ from: add(lead, offset), to: lead, style: 'part' }],
  };
}

const merge = (all: Explosion[]): Explosion => ({
  moves: all.flatMap((e) => e.moves),
  arrows: all.flatMap((e) => e.arrows),
});

function buildExplosion(ctx: PlanContext, step: GuideStep): Explosion {
  const among = new Set([...step.contextIds, ...step.partIds]);
  const fasteners = step.partIds.filter((id) => isFastener(ctx.byId.get(id)!));

  if (fasteners.length) return merge(fasteners.map((id) => fastenerMove(ctx, id, among)));

  const context = new Set(step.contextIds);
  const majors = step.partIds.filter((id) => !isInsert(ctx.byId.get(id)!));

  return merge(
    majors.flatMap((id) => {
      const seat = seatCenter(ctx, id, context);

      return seat ? [blockMove(ctx, [id], seat, 0.08)] : [];
    }),
  );
}

function insertExplosion(ctx: PlanContext, step: GuideStep): Explosion {
  const host = new Set(step.contextIds);

  return merge(step.partIds.map((id) => fastenerMove(ctx, id, host)));
}

function attachExplosion(ctx: PlanContext, step: GuideStep, deferred: Set<string>): Explosion {
  const block = step.partIds.filter((id) => !deferred.has(id));
  const context = new Set(step.contextIds);
  const seats = block.flatMap((id) => touching(ctx, id).filter((o) => context.has(o)));
  const seat = seats.length ? boxCenter(boxOf(ctx, seats)) : boxCenter(boxOf(ctx, step.contextIds));
  const among = new Set([...step.contextIds, ...step.partIds]);
  const moved = step.contextIds.length ? [blockMove(ctx, block, seat, 0.06)] : [];

  return merge([...moved, ...[...deferred].map((id) => fastenerMove(ctx, id, among))]);
}

export function explode(ctx: PlanContext, step: GuideStep, deferred: Set<string> = new Set()): Explosion {
  if (!step.contextIds.length && step.kind !== 'inserts') return { moves: [], arrows: [] };

  if (step.kind === 'inserts') return insertExplosion(ctx, step);

  return step.kind === 'attach' ? attachExplosion(ctx, step, deferred) : buildExplosion(ctx, step);
}
