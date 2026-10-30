import { AdapterMissing } from './adapters.mjs';
import { connected, heldByEdges } from './fasteners.mjs';
import { add, dot, frameOf, len, meshStats, scale, sub } from './geometry.mjs';

const probeOf = (ctx) => (ctx.probe ??= ctx.adapters.fasteners(ctx, ctx.after));
const listed = (ids, max = 6) =>
  ids.length > max ? `${ids.slice(0, max).join(', ')} and ${ids.length - max} more` : ids.join(', ');
const verdict = (bad, okText, badText) => ({
  pass: bad.length === 0,
  detail: bad.length ? `${badText}: ${listed(bad)}` : okText,
});
const screwsOf = (ctx, ids) => probeOf(ctx).screws.filter((s) => !ids || ids.includes(s.id));

export function check(name, fn) {
  return async (ctx) => {
    try {
      return { name, ...(await fn(ctx)) };
    } catch (err) {
      if (err instanceof AdapterMissing) return { name, pass: null, detail: err.message, adapter: err.adapter };

      throw err;
    }
  };
}

export function allOf(...checks) {
  return async (ctx) => {
    const results = [];

    for (const c of checks) results.push(await c(ctx));

    const failed = results.some((r) => r.pass === false);
    const unknown = results.some((r) => r.pass === null);
    const status = (failed && 'fail') || (unknown && 'unavailable') || 'pass';

    return { status, checks: results };
  };
}

export const screwsEngaged = (ids) =>
  check('Every screw engages an insert, nut or tapped part', (ctx) => {
    const p = probeOf(ctx);
    const loose = screwsOf(ctx, ids).filter((s) => s.engagementMm < 1);
    const orphans = ids ? [] : p.orphanInserts;

    return verdict(
      [...loose.map((s) => s.id), ...orphans.map((o) => `${o} (orphan insert)`)],
      'All engaged',
      'Not engaged',
    );
  });

export const engagementDepth = (ids) =>
  check('Thread engagement ≥ 1.5 × D or the insert length', (ctx) => {
    const short = screwsOf(ctx, ids).filter((s) => {
      const need = Math.min(1.5 * Number(s.size.slice(1)), s.engaged?.lengthMm ?? Infinity) - 0.2;

      return s.engagementMm < need;
    });

    return verdict(
      short.map((s) => `${s.id} (${s.engagementMm} mm)`),
      'Enough engagement',
      'Short engagement',
    );
  });

export const noShankInMaterial = (ids) =>
  check('No screw shank inside material', (ctx) =>
    verdict(
      screwsOf(ctx, ids)
        .filter((s) => s.shankInMaterial.length)
        .map((s) => `${s.id} in ${s.shankInMaterial.join('+')}`),
      'Shanks clear',
      'Shank in material',
    ),
  );

export const headsSeated = (ids) =>
  check('Screw heads seated, not sunk into a part', (ctx) =>
    verdict(
      screwsOf(ctx, ids)
        .filter((s) => !s.headSeated || s.headSunk)
        .map((s) => `${s.id} (${s.headSunk ? 'sunk' : 'not seated'})`),
      'Heads seated',
      'Heads off',
    ),
  );

export const driverAccess = (ids) =>
  check('A driver reaches every screw', async (ctx) => {
    try {
      return await ctx.adapters.removalOrder(ctx, ctx.after, { screws: ids });
    } catch (err) {
      if (!(err instanceof AdapterMissing)) throw err;
    }

    const blocked = screwsOf(ctx, ids).filter((s) => !s.driverClear);

    return {
      ...verdict(
        blocked.map((s) => `${s.id} (by ${s.blockedBy.join('+')})`),
        'Driver lines clear',
        'Blocked',
      ),
      minimal: true,
    };
  });

export const heldBy = (from, to) =>
  check(`${from} is fastened through to ${to}`, (ctx) => {
    const edges = heldByEdges(probeOf(ctx));

    return {
      pass: connected(edges, from, to),
      detail: edges.length ? edges.map((e) => `${e.a}–${e.b} (${e.screw})`).join(', ') : 'No fastened joints',
      minimal: true,
    };
  });

const byId = (scene) => new Map((scene?.parts ?? []).map((p) => [p.id, p]));
const moved = (a, b) => len(sub(a.position, b.position));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const untouched = (ids) =>
  check(`Left ${ids.join(', ')} as it was`, (ctx) => {
    const [before, after] = [byId(ctx.before), byId(ctx.after)];
    const changed = ids.filter((id) => {
      const [a, b] = [before.get(id), after.get(id)];

      return !a || !b || moved(a, b) > 0.01 || !sameJson(a.rotation, b.rotation) || !sameJson(a.hardware, b.hardware);
    });

    return verdict(changed, 'Unchanged', 'Changed');
  });

export const noNudges = (lo = 0.15, hi = 0.55) =>
  check(`No part nudged ${lo}–${hi} mm to quiet a check`, (ctx) => {
    const before = byId(ctx.before);
    const nudged = (ctx.after?.parts ?? []).filter((p) => {
      const was = before.get(p.id);
      const d = was ? moved(was, p) : 0;

      return d > lo && d < hi;
    });

    return verdict(
      nudged.map((p) => p.id),
      'No nudges',
      'Nudged',
    );
  });

const jointsOf = (scene) => new Map((scene?.project?.joints ?? []).map((j) => [j.id, j]));

export const rangeKept = (jointId, minSpanDeg) =>
  check(`${jointId} keeps its range`, (ctx) => {
    const [was, now] = [jointsOf(ctx.before).get(jointId), jointsOf(ctx.after).get(jointId)];
    const span = now?.range ? now.range[1] - now.range[0] : 0;
    const ok = !!now && span >= (minSpanDeg ?? (was?.range ? was.range[1] - was.range[0] : 0)) - 0.5;

    return { pass: ok, detail: now ? `Range ${now.range?.join(' to ')}°` : 'Joint removed' };
  });

export const geometryChanged = (ids) =>
  check(`Changed the geometry of ${ids.join(' or ')}`, (ctx) => {
    const [before, after] = [byId(ctx.before), byId(ctx.after)];
    const changed = ids.filter((id) => {
      const [a, b] = [before.get(id), after.get(id)];

      return !b || !a || a.cad?.code !== b.cad?.code || moved(a, b) > 0.05 || !sameJson(a.rotation, b.rotation);
    });

    return {
      pass: changed.length > 0,
      detail: changed.length ? `Changed ${changed.join(', ')}` : 'Geometry unchanged',
    };
  });

export const rolesKept = (filter) =>
  check('No part turned into a reference or hidden to pass a check', (ctx) => {
    const after = byId(ctx.after);
    const dodged = (ctx.before?.parts ?? [])
      .filter(filter)
      .filter((p) => !after.has(p.id) || after.get(p.id).role !== p.role || after.get(p.id).visible === false);

    return verdict(
      dodged.map((p) => p.id),
      'Roles kept',
      'Dodged',
    );
  });

const PARALLEL_COS = Math.cos((2 * Math.PI) / 180);
const mirrorX = (v) => [-v[0], v[1], v[2]];

function outputsOf(ctx) {
  return (ctx.after?.parts ?? []).flatMap((p) => {
    const out = ctx.adapters.servoOutput(ctx, p);
    const frame = frameOf(p);

    return out ? [{ id: p.id, at: frame.toWorld(out.point), axis: frame.axis(out.axis) }] : [];
  });
}

function offAxis(right, left) {
  const origin = mirrorX(left.at);
  const axis = mirrorX(left.axis);

  if (Math.abs(dot(axis, right.axis)) < PARALLEL_COS) return Infinity;

  const rel = sub(right.at, origin);

  return len(sub(rel, scale(axis, dot(rel, axis))));
}

export const servoOutputsMirrored = (tolMm = 0.5) =>
  check(`Every servo output within ${tolMm} mm of the mirrored joint axis`, (ctx) => {
    const outputs = outputsOf(ctx);
    const left = outputs.filter((o) => o.at[0] > 1);
    const right = outputs.filter((o) => o.at[0] < -1);
    const errors = left.map((l) => ({
      id: l.id,
      mm: Math.round(Math.min(Infinity, ...right.map((r) => offAxis(r, l))) * 100) / 100,
    }));
    const bad = errors.filter((e) => e.mm > tolMm);

    return {
      pass: left.length > 0 && bad.length === 0,
      detail: bad.length ? `Off: ${listed(bad.map((e) => `${e.id} ${e.mm} mm`))}` : `${errors.length} servos mirrored`,
    };
  });

export const twinsMatch = (leftId, rightId, tol = 0.01) =>
  check(`${rightId} matches the mirrored ${leftId}`, (ctx) => {
    const parts = byId(ctx.after);
    const [a, b] = [meshStats(parts.get(leftId) ?? {}), meshStats(parts.get(rightId) ?? {})];

    if (!a || !b) return { pass: false, detail: 'Twin missing' };

    const dv = Math.abs(a.volume - b.volume) / Math.max(a.volume, 1);
    const ds = Math.max(...a.size.map((v, k) => Math.abs(v - b.size[k]) / Math.max(v, 1)));
    const mirror = len(sub(add(a.centroid, [-2 * a.centroid[0], 0, 0]), b.centroid)) / Math.max(...a.size, 1);
    const worst = Math.max(dv, ds, mirror);

    return {
      pass: worst < tol,
      detail: `Volume ${(dv * 100).toFixed(1)}%, size ${(ds * 100).toFixed(1)}%, mirror ${(mirror * 100).toFixed(1)}%`,
    };
  });

export const answerSays = ({ must = [], mustNot = [], label }) =>
  check(label, (ctx) => {
    const text = ctx.answer ?? '';
    const missingAll = must.filter((re) => !re.test(text)).map(String);
    const said = mustNot.filter((re) => re.test(text)).map(String);

    return {
      pass: !missingAll.length && !said.length,
      detail:
        [missingAll.length && `Missing ${missingAll.join(', ')}`, said.length && `Says ${said.join(', ')}`]
          .filter(Boolean)
          .join('; ') || 'Answer fits',
    };
  });

export const viaAdapter = (name, label, ...args) => check(label, (ctx) => ctx.adapters[name](ctx, ctx.after, ...args));

export const underBudget = () =>
  check('BOM within the budget', async (ctx) => {
    const bom = await ctx.adapters.bom(ctx);

    return {
      pass: bom.estimatedUsd !== null && bom.budgetUsd !== null && bom.estimatedUsd <= bom.budgetUsd,
      detail: `~$${bom.estimatedUsd} of $${bom.budgetUsd}`,
    };
  });

export const checkRowsOk = ({ pattern, label, allowed = ['pass', 'warn'] }) =>
  check(label, async (ctx) => {
    const rows = (await ctx.adapters.checkRows(ctx)).filter((r) => pattern.test(r.check));
    const bad = rows.filter((r) => !allowed.includes(r.status));

    return {
      pass: rows.length > 0 && bad.length === 0,
      detail: rows.map((r) => `${r.check}: ${r.status}`).join('; ') || 'No such rows',
    };
  });

export const adapterOr = ({ adapter, label, args, minimal }) =>
  check(label, async (ctx) => {
    try {
      return await ctx.adapters[adapter](ctx, ctx.after, args);
    } catch (err) {
      if (!(err instanceof AdapterMissing) || !minimal) throw err;
    }

    const result = await minimal(ctx);

    return { pass: result.pass, detail: `${result.detail} (minimal)`, minimal: true };
  });

export const screwsFit = (ids) =>
  check('Screws clear their holes (check_scene clean for fasteners)', (ctx) =>
    verdict(
      screwsOf(ctx, ids)
        .filter((s) => s.shankRubs.length)
        .map((s) => `${s.id} rubs ${s.shankRubs.join('+')}`),
      'Holes clear',
      'Tight',
    ),
  );

export const pending = (label) =>
  check(label, () => {
    throw new AdapterMissing('grader', 'a grader written for this task');
  });
