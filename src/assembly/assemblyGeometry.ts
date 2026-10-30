import * as THREE from 'three';
import type { Placed } from '../three/analysis/collide';
import type { ChainResult, FastenerInput, V3 } from './assemblyTypes';
import { driverOptions, type DriverOption } from './driverAccess';
import { traceFasteners } from './fastenerChain';
import { AXES, blockersAlong, directionsFor, exitTravel, ownTravel } from './moveBlockers';
import { splitPlanes, type SplitPlane } from './splitTest';

export interface AssemblyGeometryInput extends FastenerInput {
  serviceable: string[];
  budgetMs: number;
}

export interface PartMoves {
  dirs: V3[];
  local: string[][];
  exit: string[][] | null;
  captured: boolean;
  contents: string[];
}

export interface AssemblyGeometry {
  chains: ChainResult;
  moves: Record<string, PartMoves>;
  drivers: Record<string, DriverOption[]>;
  splits: Record<string, SplitPlane[]>;
  timedOut: boolean;
  ms: number;
}

const CAPTURE_MM = 2;

interface Scene {
  placed: Placed[];
  majors: Placed[];
  chains: ChainResult;
  robot: THREE.Box3;
  hostedBy: Map<string, string>;
  pinAxes: Map<string, V3[]>;
  deadline: number;
}

function sceneOf(placed: Placed[], input: AssemblyGeometryInput, deadline: number): Scene {
  const majors = placed.filter((p) => input.roles[p.id] === 'printed' || input.roles[p.id] === 'component');
  const chains = traceFasteners(placed, input);
  const robot = new THREE.Box3();
  const pinAxes = new Map<string, V3[]>();

  majors.forEach((m) => robot.union(m.box));

  for (const c of chains.screws) for (const id of c.stack) pinAxes.set(id, [...(pinAxes.get(id) ?? []), c.axis]);

  const hostedBy = new Map(chains.sleeves.filter((s) => s.host).map((s) => [s.id, s.host!]));

  return { placed, majors, chains, robot, hostedBy, pinAxes, deadline };
}

const contained = (outer: Placed, inner: Placed) => outer.box.containsBox(inner.box.clone().expandByScalar(-0.5));

function partMoves(scene: Scene, p: Placed, serviceable: boolean): PartMoves {
  const candidates = scene.placed.filter((q) => q.id !== p.id && scene.hostedBy.get(q.id) !== p.id);
  const dirs = directionsFor(scene.pinAxes.get(p.id) ?? []);
  const along = (dir: THREE.Vector3, travel: number, among = candidates) =>
    blockersAlong({ part: p, dir, travel, candidates: among });
  const pinned = scene.pinAxes.has(p.id);
  const majorsNear = scene.majors.filter((q) => q.id !== p.id);

  return {
    dirs: dirs.map((d) => d.toArray()),
    local: dirs.map((d) => along(d, ownTravel(p, d))),
    exit: serviceable ? dirs.map((d) => along(d, exitTravel(p, d, scene.robot))) : null,
    captured: !pinned && AXES.every((a) => along(new THREE.Vector3(...a), CAPTURE_MM, majorsNear).length > 0),
    contents: scene.majors.filter((q) => q.id !== p.id && contained(p, q)).map((q) => q.id),
  };
}

function isEnclosure(m: PartMoves) {
  return m.contents.length > 0 && m.local.slice(0, AXES.length).every((b) => b.some((id) => m.contents.includes(id)));
}

export function assemblyGeometry(placed: Placed[], input: AssemblyGeometryInput): AssemblyGeometry {
  const started = performance.now();
  const scene = sceneOf(placed, input, started + input.budgetMs);
  const serviceable = new Set(input.serviceable);
  const out: AssemblyGeometry = { chains: scene.chains, moves: {}, drivers: {}, splits: {}, timedOut: false, ms: 0 };
  const late = () => performance.now() > scene.deadline;
  const skipForDrivers = new Set(scene.chains.sleeves.filter((s) => s.kind === 'insert').map((s) => s.id));

  for (const c of scene.chains.screws) {
    if (late()) break;

    out.drivers[c.id] = driverOptions(c, placed, skipForDrivers);
  }

  for (const p of scene.majors) {
    if (late()) break;

    out.moves[p.id] = partMoves(scene, p, serviceable.has(p.id));
  }

  for (const p of scene.majors.filter((m) => out.moves[m.id] && isEnclosure(out.moves[m.id]))) {
    if (late()) break;

    out.splits[p.id] = splitPlanes(
      p,
      scene.majors.filter((q) => q.id !== p.id),
    );
  }

  out.timedOut = late();
  out.ms = Math.round(performance.now() - started);

  return out;
}
