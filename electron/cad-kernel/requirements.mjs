import { throughHoles } from './holes.mjs';
import { sampleSurface } from './meshQuery.mjs';

const SYMMETRY_TOLERANCE_MM = 0.2;
const FLAT_BASE_SHARE = 0.25;

const fmt = (v) => +(+v).toFixed(2);
const holeTolerance = (d) => Math.max(0.25, 0.04 * d);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function holesCheck(spec, ctx) {
  const axis = spec.axis ?? 'z';
  const want = `${plural(spec.count, 'through hole')} Ø${spec.d} along ${axis}`;

  if (spec.through === false) {
    return { name: 'holes', want, pass: null, got: 'blind holes are not measured; declare them as bore ports' };
  }

  const found = ctx.holesAlong(axis, spec.d);
  const matching = found.filter((h) => Math.abs(h.diameter - spec.d) <= holeTolerance(spec.d));
  const others = found.filter((h) => !matching.includes(h)).map((h) => `Ø${h.diameter}`);
  const got = `${matching.length} found${others.length ? `, others along ${axis}: ${others.slice(0, 6).join(', ')}` : ''}`;

  if (matching.length === spec.count) return { name: 'holes', want, pass: true, got };

  return {
    name: 'holes',
    want,
    pass: false,
    got,
    fix: 'Check each hole goes all the way through (extend the cutter past both faces) and its diameter.',
  };
}

function wallCheck(want, ctx) {
  const walls = ctx
    .walls()
    .map((w) => w.thickness)
    .filter((t) => t > 0.05);

  if (walls.length < 20) return { name: 'min wall', want: `${want} mm`, pass: null, got: 'too few samples' };

  walls.sort((a, b) => a - b);

  const thin = walls[Math.floor(walls.length * 0.02)];

  return {
    name: 'min wall',
    want: `${want} mm`,
    pass: thin >= want - 0.05,
    got: `thinnest sampled ${fmt(thin)} mm`,
    fix: `Thicken the thin walls to at least ${want} mm (shell thickness, pocket depth or hole spacing).`,
  };
}

function flatBaseCheck(ctx) {
  const { mesh, tris, stats } = ctx;
  const zMin = stats.bbox.min[2];
  let area = 0;

  for (let t = 0; t < tris.areas.length; t++) {
    if (tris.normals[t * 3 + 2] > -0.999) continue;

    const low = [0, 1, 2].every((k) => mesh.positions[mesh.indices[t * 3 + k] * 3 + 2] < zMin + 0.05);

    area += low ? tris.areas[t] : 0;
  }

  const footprint = stats.bbox.size[0] * stats.bbox.size[1];
  const share = footprint ? area / footprint : 0;

  return {
    name: 'flat base',
    want: `a flat face on z = ${fmt(zMin)} covering ${FLAT_BASE_SHARE * 100}% of the footprint`,
    pass: share >= FLAT_BASE_SHARE,
    got: `${Math.round(area)} mm² (${Math.round(share * 100)}%)`,
    fix: 'Give it a flat bottom: flatten the lowest face, or rotate the part so its largest flat face is at the bottom.',
  };
}

function symmetryCheck(axis, ctx) {
  const k = 'xyz'.indexOf(axis);
  const centre = (ctx.stats.bbox.min[k] + ctx.stats.bbox.max[k]) / 2;
  const deviations = sampleSurface(ctx.mesh, ctx.tris, 300, 5).map((s) => {
    const mirrored = s.point.clone();

    mirrored.setComponent(k, 2 * centre - mirrored.getComponent(k));

    return { d: ctx.query().closest(mirrored)?.distance ?? Infinity, at: s.point };
  });

  deviations.sort((a, b) => a.d - b.d);

  const p95 = deviations[Math.floor(deviations.length * 0.95)];
  const worst = deviations.at(-1);

  return {
    name: `symmetric in ${axis}`,
    want: `mirror image across ${axis} = ${fmt(centre)}`,
    pass: p95.d <= SYMMETRY_TOLERANCE_MM,
    got: `95% within ${fmt(p95.d)} mm, worst ${fmt(worst.d)} mm at [${worst.at.toArray().map((v) => fmt(v))}]`,
    fix: 'Model one half and mirror it (mirror_copy / xflip_copy), or fix the feature at the worst point.',
  };
}

function countCheck(name, want, got, fix) {
  return { name, want: String(want), pass: got === want, got: got === null ? 'unknown' : String(got), fix };
}

export function checkRequirements(expect, ctx) {
  if (!expect) return [];

  const results = [];

  for (const spec of expect.holes ?? []) results.push(holesCheck(spec, ctx));

  if (expect.min_wall_mm !== undefined) results.push(wallCheck(expect.min_wall_mm, ctx));

  if (expect.flat_base) results.push(flatBaseCheck(ctx));

  for (const axis of expect.symmetric ?? []) results.push(symmetryCheck(axis, ctx));

  if (expect.genus !== undefined) {
    const fix =
      ctx.topology.genus === null
        ? 'Fix the non-manifold edges first; genus is only defined for a clean solid.'
        : 'Genus counts through holes and handles: add or close the missing ones.';

    results.push(countCheck('genus', expect.genus, ctx.topology.genus, fix));
  }

  if (expect.bodies !== undefined) {
    results.push(
      countCheck('bodies', expect.bodies, ctx.topology.bodies, 'Fuse loose pieces with at least 0.2 mm overlap.'),
    );
  }

  return results;
}

export function holesContext(mesh) {
  const cache = new Map();

  return (axis, d) => {
    const key = `${axis}:${d}`;

    if (!cache.has(key)) cache.set(key, throughHoles(mesh, axis, Math.max(0.8, d * 0.5)).holes);

    return cache.get(key);
  };
}
