import { linkCenters, linkRegions } from './cut';
import { dipsBelow, fieldSolid, merged, nearSurface, overlap, type PointTest } from './fieldSolid';
import { hollowOf } from './hollow';
import { meshOfSolid, soupOfMesh, type ManifoldApi, type Solid } from './manifold';
import { SolidField } from './solidField';
import { SweepRaster, type Motion } from './sweepRaster';
import { centerOf, sizeOf, soupBounds, type Bounds } from './vec';
import { BASE_LINK, WALL_MM, type V3, type WrapInput, type WrapJoint, type WrapResult } from './wrapTypes';

const FIT_MARGIN_MM = 6;
const MIN_PIECE_MM3 = 20;
const PARENT_SHARE = 0.5;
const GRID_POINTS = 800_000;
const MIN_EDGE_MM = 1.2;
const STATIC_AXIS: V3 = [0, 1, 0];
const toRadians = (deg: number) => (deg * Math.PI) / 180;

interface Work {
  api: ManifoldApi;
  input: WrapInput;
  regions: Map<string, Solid>;
  soups: Map<string, Float32Array>;
  edge: number;
  band: number;
}

export function fitMesh(mesh: Float32Array, robot: Bounds): { soup: Float32Array; scale: number } {
  const box = soupBounds([mesh]);

  if (!box) throw new Error('The mesh has no triangles.');

  const size = sizeOf(box);
  const want = sizeOf(robot).map((v) => v + 2 * FIT_MARGIN_MM);
  const scale = Math.max(...want.map((v, k) => v / Math.max(size[k], 1e-6)));
  const from = centerOf(box);
  const to = centerOf(robot);
  const soup = new Float32Array(mesh.length);

  for (let i = 0; i < mesh.length; i++) soup[i] = (mesh[i] - from[i % 3]) * scale + to[i % 3];

  return { soup, scale };
}

const solidBounds = (solid: Solid): Bounds => {
  const { min, max } = solid.boundingBox();

  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
};

const live = (work: Work, link: string) => {
  const region = work.regions.get(link);

  return region && !region.isEmpty() ? region : null;
};

function soupOf(work: Work, link: string): Float32Array | null {
  const region = live(work, link);

  if (!region) return null;

  const known = work.soups.get(link);

  if (known) return known;

  const soup = soupOfMesh(meshOfSolid(region));

  work.soups.set(link, soup);

  return soup;
}

const soupsOf = (work: Work, links: string[]) => links.flatMap((l) => soupOf(work, l) ?? []);

const boundsOf = (work: Work, links: string[]) =>
  merged(links.map((l) => live(work, l)).map((r) => (r ? solidBounds(r) : null)));

function carve(work: Work, links: string[], cutter: Solid | null): void {
  if (!cutter) return;

  const reach = solidBounds(cutter);

  for (const link of links) {
    const region = live(work, link);

    if (!region || !overlap(solidBounds(region), reach)) continue;

    work.regions.set(link, region.subtract(cutter));
    work.soups.delete(link);
    region.delete();
  }

  cutter.delete();
}

function carveWhere(work: Work, links: string[], spec: { test: PointTest; box: Bounds | null }): void {
  const targets = links.filter((l) => live(work, l));
  const near = nearSurface(soupsOf(work, targets), work.band);
  const test: PointTest = (x, y, z) => spec.test(x, y, z) && near.test(x, y, z);

  try {
    carve(work, targets, fieldSolid(work.api, test, overlap(spec.box, boundsOf(work, targets)), work.edge));
  } finally {
    near.dispose();
  }
}

function rasterOf(motion: Motion, cell: number, soups: Float32Array[]): SweepRaster {
  const raster = new SweepRaster(motion, cell);

  soups.forEach((soup) => raster.addSoup(soup));
  raster.seal();

  return raster;
}

function carveBodies(work: Work, robot: Bounds): void {
  const soups = work.input.bodies.map((b) => b.soup);
  const fields = soups.map((soup) => new SolidField(soup));
  const motion: Motion = { kind: 'revolute', origin: centerOf(robot), axis: STATIC_AXIS, range: [0, 0] };
  const near = rasterOf(motion, work.edge, soups);
  const test: PointTest = (x, y, z) => near.hits(x, y, z) || fields.some((f) => f.contains(x, y, z));

  try {
    carveWhere(work, [...work.regions.keys()], { test, box: near.reach() });
  } finally {
    fields.forEach((f) => f.dispose());
  }
}

export function subtreeOf(joint: WrapJoint, joints: WrapJoint[]): Set<string> {
  const moving = new Set([joint.id]);

  for (const j of joints) if (moving.has(j.parentLink)) moving.add(j.id);

  return moving;
}

const motionOf = (joint: WrapJoint): Motion => ({
  kind: joint.type,
  origin: joint.origin,
  axis: joint.axis,
  range: joint.type === 'revolute' ? [toRadians(joint.range[0]), toRadians(joint.range[1])] : joint.range,
});

const scaled = (motion: Motion, k: number): Motion => ({
  ...motion,
  range: [motion.range[0] * k, motion.range[1] * k],
});

const reversed = (motion: Motion): Motion => ({ ...motion, range: [-motion.range[1], -motion.range[0]] });

function sweepTest(rasters: SweepRaster[], dips: PointTest | null) {
  const used = rasters.filter((r) => !r.empty);
  const test: PointTest = (x, y, z) => used.some((r) => r.hits(x, y, z)) || (dips?.(x, y, z) ?? false);

  return { test, box: dips ? null : merged(used.map((r) => r.reach())) };
}

function turningReach(joint: WrapJoint, moving: Bounds | null): Bounds | null {
  if (!moving) return null;

  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    [0, 1, 2].map((k) => ((i >> k) & 1 ? moving.max[k] : moving.min[k])),
  ) as V3[];

  if (joint.type === 'prismatic') {
    const ends = corners.flatMap((c) => joint.range.map((d) => c.map((v, k) => v + d * joint.axis[k]) as V3));

    return merged(ends.map((c) => ({ min: c, max: c })));
  }

  const radius = Math.max(...corners.map((c) => Math.hypot(...c.map((v, k) => v - joint.origin[k]))));

  return { min: joint.origin.map((v) => v - radius) as V3, max: joint.origin.map((v) => v + radius) as V3 };
}

function clearJoint(work: Work, joint: WrapJoint): void {
  const moving = subtreeOf(joint, work.input.joints);
  const links = [...work.regions.keys()];
  const movingLinks = links.filter((l) => moving.has(l));
  const fixedLinks = links.filter((l) => !moving.has(l));
  const bodies = (inMoving: boolean) =>
    work.input.bodies.filter((b) => moving.has(b.link) === inMoving).map((b) => b.soup);
  const motion = motionOf(joint);
  const outward = sweepTest(
    [
      rasterOf(scaled(motion, PARENT_SHARE), work.edge, soupsOf(work, movingLinks)),
      rasterOf(motion, work.edge, bodies(true)),
    ],
    null,
  );

  carveWhere(work, fixedLinks, { test: outward.test, box: outward.box });

  const reach = turningReach(joint, boundsOf(work, movingLinks));
  const near = fixedLinks.filter((l) => overlap(boundsOf(work, [l]), reach));
  const { floorY } = work.input;
  const dips = joint.floor && floorY !== null ? dipsBelow(motion, floorY) : null;
  const back = rasterOf(reversed(motion), work.edge, [...soupsOf(work, near), ...bodies(false)]);
  const inward = sweepTest([back], dips);

  carveWhere(work, movingLinks, { test: inward.test, box: inward.box ?? boundsOf(work, movingLinks) });
}

function cleaned(api: ManifoldApi, region: Solid): Solid | null {
  const pieces = region.decompose();
  const kept = pieces.filter((p) => p.volume() >= MIN_PIECE_MM3);
  const whole = kept.length ? api.Manifold.compose(kept) : null;

  pieces.forEach((p) => p.delete());

  return whole;
}

function startRegions(api: ManifoldApi, input: WrapInput, robot: Bounds) {
  const { soup, scale } = fitMesh(input.mesh, robot);
  const size = sizeOf(soupBounds([soup])!);
  const edge = Math.max(MIN_EDGE_MM, Math.cbrt((size[0] * size[1] * size[2]) / GRID_POINTS));
  const wall = input.wallMm ?? WALL_MM;
  const hollow = hollowOf(api, soup, { wallMm: wall, edgeMm: edge });

  if (!hollow) throw new Error('The mesh has no inside to hollow.');

  const shell = input.floorY === null ? hollow : hollow.trimByPlane([0, 1, 0], input.floorY);

  if (shell !== hollow) hollow.delete();

  const linkBoxes = new Map<string, Bounds>();

  for (const link of [BASE_LINK, ...input.joints.map((j) => j.id)]) {
    const box = soupBounds(input.bodies.filter((b) => b.link === link).map((b) => b.soup));

    if (box) linkBoxes.set(link, box);
  }

  const regions = linkRegions(shell, input.joints, linkCenters(input.joints, linkBoxes));

  return { regions, edge, scale, band: wall + 2 * edge };
}

export function wrapRobot(api: ManifoldApi, input: WrapInput): WrapResult {
  const robot = soupBounds(input.bodies.map((b) => b.soup));

  if (!robot) throw new Error('The robot has no parts to wrap.');

  const floorY = input.floorY !== null && robot.min[1] >= input.floorY - 1 ? input.floorY : null;
  const grounded = { ...input, floorY };
  const { regions, edge, scale, band } = startRegions(api, grounded, robot);
  const work: Work = { api, input: grounded, regions, soups: new Map(), edge, band };

  carveBodies(work, robot);
  input.joints.forEach((joint) => clearJoint(work, joint));

  const shells = [...work.regions].flatMap(([link, region]) => {
    const kept = cleaned(api, region);

    region.delete();

    if (!kept) return [];

    const mesh = meshOfSolid(kept);

    kept.delete();

    return [{ link, ...mesh }];
  });

  return { shells, scale };
}
