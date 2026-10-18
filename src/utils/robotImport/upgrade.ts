import * as THREE from 'three';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import type { Model } from './model';
import { catalogFrame, publishedData, round, ROBOT_DATA_VERSION, S, type PublishedData } from './published';
import { readModel } from './readModel';

export interface RobotSourceRef {
  url: string;
  rotate?: Array<[string, number]>;
}

export interface RobotUpgrade {
  parts: Map<string, Partial<ScenePart>>;
  joints: Map<string, Partial<RobotJoint>>;
  upgraded: string[];
  missing: string[];
  missingIds: string[];
}

type ResolveSource = (name: string, robotParts: ScenePart[]) => RobotSourceRef | null;

interface StaleRobot {
  name: string;
  parts: Array<{ part: ScenePart; link: string }>;
}

function linkOf(p: ScenePart): { robot: string; name: string; link: string } | null {
  if (p.kind !== 'mesh') return null;

  if (p.robotLink)
    return { robot: p.robotLink.robot, name: p.group?.name ?? p.robotLink.robot, link: p.robotLink.link };

  const src = p.mesh?.source;
  const at = src?.indexOf(' · ') ?? -1;

  if (!src || at < 0 || !p.group) return null;

  return { robot: p.group.id, name: p.group.name, link: src.slice(at + 3) };
}

export function needsRobotUpgrade(parts: ScenePart[], skip: Set<string> = new Set()): boolean {
  return parts.some((p) => {
    const l = linkOf(p);

    return l && !skip.has(l.robot) && (p.robotLink?.version ?? 0) < ROBOT_DATA_VERSION;
  });
}

function staleRobots(parts: ScenePart[], skip: Set<string>): Map<string, StaleRobot> {
  const robots = new Map<string, StaleRobot>();

  for (const p of parts) {
    const l = linkOf(p);

    if (!l || skip.has(l.robot) || (p.robotLink?.version ?? 0) >= ROBOT_DATA_VERSION) continue;

    const r = robots.get(l.robot) ?? { name: l.name, parts: [] };

    r.parts.push({ part: p, link: l.link });
    robots.set(l.robot, r);
  }

  return robots;
}

async function robotSource(
  r: StaleRobot,
  resolve: ResolveSource,
): Promise<{ ref: RobotSourceRef; model: Model } | null> {
  const first = r.parts.find((x) => x.part.robotLink?.url)?.part.robotLink;
  const ref = first?.url
    ? { url: first.url, rotate: first.rotate }
    : resolve(
        r.name,
        r.parts.map((x) => x.part),
      );

  if (!ref) return null;

  try {
    return { ref, model: (await readModel({ kind: 'url', url: ref.url })).model };
  } catch {
    return null;
  }
}

function anchoredCenter(
  parts: ScenePart[],
  mine: RobotJoint[],
  ids: Set<string>,
  data: PublishedData,
): ((p: ScenePart) => THREE.Vector3) | null {
  const anchor = mine.find((j) => j.frame && ids.has(j.frame.part) && data.joints.has(j.name));

  if (!anchor) return null;

  const a = parts.find((p) => p.id === anchor.frame!.part)!;
  const aCenter = data.joints
    .get(anchor.name)!
    .origin.clone()
    .sub(new THREE.Vector3(...anchor.frame!.origin));
  const inv = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(...(a.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]), 'XYZ'))
    .invert();

  return (p) =>
    new THREE.Vector3(...p.position)
      .sub(new THREE.Vector3(...a.position))
      .applyQuaternion(inv)
      .add(aCenter);
}

interface RobotPatch {
  robotId: string;
  ref: RobotSourceRef;
  data: PublishedData;
  centerOf: ((p: ScenePart) => THREE.Vector3) | null;
}

function partPatch(u: RobotPatch, part: ScenePart, link: string): Partial<ScenePart> {
  const d = u.data.links.get(link);
  const patch: Partial<ScenePart> = {
    robotLink: { robot: u.robotId, link, url: u.ref.url, rotate: u.ref.rotate, version: ROBOT_DATA_VERSION },
  };

  if (!d) return patch;

  patch.massG = Math.round(d.massKg * 10000) / 10;

  if (u.centerOf) {
    const c = d.com.clone().sub(u.centerOf(part));

    patch.com = [round(c.x), round(c.y), round(c.z)];
  }

  return patch;
}

interface Upgrading {
  out: RobotUpgrade;
  parts: ScenePart[];
  joints: RobotJoint[];
}

function upgradeRobot(u: Upgrading, robotId: string, r: StaleRobot, found: { ref: RobotSourceRef; model: Model }) {
  const { ref, model } = found;
  const frame = ref.rotate ? catalogFrame(ref.rotate) : S;
  const data = publishedData(model, frame, new Set(r.parts.map((x) => x.link)));
  const ids = new Set(r.parts.map((x) => x.part.id));
  const mine = u.joints.filter(
    (j) => [...j.parent, ...j.child].some((id) => ids.has(id)) || (j.frame && ids.has(j.frame.part)),
  );

  for (const j of mine) {
    const d = data.joints.get(j.name);

    if (!d) continue;

    u.out.joints.set(j.id, {
      effortNm: d.effort,
      velocity: d.velocity === undefined ? undefined : round(d.velocity),
      published: r.name,
    });
  }

  const patch: RobotPatch = { robotId, ref, data, centerOf: anchoredCenter(u.parts, mine, ids, data) };

  for (const { part, link } of r.parts) u.out.parts.set(part.id, partPatch(patch, part, link));

  u.out.upgraded.push(r.name);
}

export async function upgradeRobots(
  parts: ScenePart[],
  joints: RobotJoint[],
  resolve: ResolveSource,
  skip: Set<string> = new Set(),
): Promise<RobotUpgrade | null> {
  const robots = staleRobots(parts, skip);

  if (!robots.size) return null;

  const out: RobotUpgrade = { parts: new Map(), joints: new Map(), upgraded: [], missing: [], missingIds: [] };

  for (const [robotId, r] of robots) {
    const found = await robotSource(r, resolve);

    if (!found) {
      out.missing.push(r.name);
      out.missingIds.push(robotId);

      continue;
    }

    upgradeRobot({ out, parts, joints }, robotId, r, found);
  }

  return out;
}
