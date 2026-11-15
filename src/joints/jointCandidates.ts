import { canonicalAxis, coaxialPair, roundFaces, slideTravel, type Pairing } from './axisFinder';
import { axisClusters, collinear, type AxisLink } from './axisClusters';
import type { Cylinder } from './cylinderFit';
import type { MeshIndex, V3 } from './meshIndex';
import { orientJointGraph } from './jointGraph';
import { pairKey } from '../../electron/cad-kernel/pairKey.mjs';

export interface Body {
  id: string;
  index: MeshIndex;
}

export interface JointCandidate {
  parent: string;
  child: string;
  pin?: string;
  shaftOn: string;
  origin: V3;
  axis: V3;
  radius: number;
  engaged: number;
  travel: [number, number];
  confidence: number;
}

export interface LoneFace {
  part: string;
  origin: V3;
  axis: V3;
  radius: number;
  bore: boolean;
}

export interface JointAxes {
  candidates: JointCandidate[];
  fastened: Array<[string, string]>;
  faces: LoneFace[];
}

interface Join {
  a: string;
  b: string;
  pin?: string;
  shaftOn: string;
  pairing: Pairing;
  confidence: number;
}

const FACES_PER_PART = 3;
const SAME_FLOOR_MM = 1;

const hundredth = (v: number) => Math.round(v * 100) / 100;

const confidenceOf = (p: Pairing) => hundredth(Math.min(1, Math.max(0, p.fit * Math.min(1, p.engaged / p.radius))));

function linksOf(bodies: Body[]): AxisLink[] {
  const faces = new Map(bodies.map((b) => [b.id, roundFaces(b.index)]));
  const links: AxisLink[] = [];

  bodies.forEach((a, i) => {
    for (const b of bodies.slice(i + 1)) {
      const pairing = coaxialPair(faces.get(a.id)!, faces.get(b.id)!);
      const [shaft, bore] = pairing?.shaftOn === 'a' ? [a.id, b.id] : [b.id, a.id];

      if (pairing) links.push({ shaft, bore, pairing });
    }
  });

  return links;
}

function joinsOf(cluster: AxisLink[]): Join[] {
  const [first] = cluster;

  if (cluster.length === 1) {
    const { shaft, bore, pairing } = first;

    return [{ a: bore, b: shaft, shaftOn: shaft, pairing, confidence: confidenceOf(pairing) }];
  }

  return cluster.flatMap((x, i) =>
    cluster.slice(i + 1).map((y) => ({
      a: x.bore,
      b: y.bore,
      pin: first.shaft,
      shaftOn: first.shaft,
      pairing: x.pairing.engaged >= y.pairing.engaged ? x.pairing : y.pairing,
      confidence: Math.min(confidenceOf(x.pairing), confidenceOf(y.pairing)),
    })),
  );
}

function sortedJoins(joins: Join[]) {
  const byPair = new Map<string, Join[]>();

  for (const j of joins) {
    const key = pairKey(j.a, j.b, '\n');

    byPair.set(key, [...(byPair.get(key) ?? []), j]);
  }

  const kept: Join[] = [];
  const fastened: Array<[string, string]> = [];

  for (const group of byPair.values()) {
    const [best, ...rest] = group.sort((x, y) => y.confidence - x.confidence);

    if (rest.some((j) => !collinear(best.pairing, j.pairing))) fastened.push([best.a, best.b]);
    else kept.push(best);
  }

  return { kept, fastened };
}

function footOf(index: MeshIndex) {
  const v = index.vertices;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < v.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3], v[i]);
    hi[i % 3] = Math.max(hi[i % 3], v[i]);
  }

  return { floor: lo[1], volume: (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) };
}

function rootFirst(bodies: Body[]) {
  const feet = new Map(bodies.map((b) => [b.id, footOf(b.index)]));

  return [...bodies.map((b) => b.id)].sort((x, y) => {
    const [a, b] = [feet.get(x)!, feet.get(y)!];

    return Math.abs(a.floor - b.floor) > SAME_FLOOR_MM ? a.floor - b.floor : b.volume - a.volume;
  });
}

function loneFaces(bodies: Body[], links: AxisLink[]): LoneFace[] {
  const used = new Set<Cylinder>(links.flatMap((l) => [l.pairing.shaft, l.pairing.bore]));

  return bodies.flatMap((b) =>
    roundFaces(b.index)
      .filter((c) => !used.has(c) && c.length >= c.radius)
      .sort((x, y) => y.radius * y.length - x.radius * x.length)
      .slice(0, FACES_PER_PART)
      .map((c) => ({ part: b.id, origin: c.center, axis: canonicalAxis(c.axis), radius: c.radius, bore: !c.convex })),
  );
}

export function jointCandidates(bodies: Body[]): JointAxes {
  const links = linksOf(bodies);
  const { kept, fastened } = sortedJoins(axisClusters(links).flatMap(joinsOf));
  const index = new Map(bodies.map((b) => [b.id, b.index]));
  const candidates = orientJointGraph(rootFirst(bodies), kept, fastened).map((j): JointCandidate => {
    const axis = canonicalAxis(j.pairing.axis);
    const line = { origin: j.pairing.origin, axis };

    return {
      parent: j.a,
      child: j.b,
      ...(j.pin ? { pin: j.pin } : {}),
      shaftOn: j.shaftOn,
      origin: line.origin,
      axis,
      radius: j.pairing.radius,
      engaged: hundredth(j.pairing.engaged),
      travel: slideTravel(index.get(j.a)!, index.get(j.b)!, line),
      confidence: j.confidence,
    };
  });

  return { candidates, fastened, faces: loneFaces(bodies, links) };
}
