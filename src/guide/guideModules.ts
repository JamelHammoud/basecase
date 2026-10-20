import type { RobotJoint, ScenePart } from '../types/robotics';
import { jointGroupLabel } from '../utils/jointNames';
import { buildRig } from '../utils/kinematics';
import { boxCenter, unionBox } from './guideMath';
import { isMajor, itemKeyOf } from './guideItems';
import { MAIN_MODULE, type Box, type GuideModule, type GuideScene } from './guideTypes';

const MIN_MAJORS = 3;
const GROUP_SHARE_MAX = 0.8;

interface Draft {
  id: string;
  name: string;
  parent: string | null;
  partIds: string[];
}

function uniqueName(name: string, taken: Map<string, number>): string {
  const n = (taken.get(name) ?? 0) + 1;

  taken.set(name, n);

  return n === 1 ? name : `${name} ${n}`;
}

function jointModules(joints: RobotJoint[], parts: ScenePart[]): { drafts: Draft[]; moduleOf: Map<string, string> } {
  const rig = buildRig(joints, parts);
  const moduleOfJoint = new Map<string, string>();
  const drafts = new Map<string, Draft>([[MAIN_MODULE, { id: MAIN_MODULE, name: '', parent: null, partIds: [] }]]);
  const names = new Map<string, number>();

  for (const joint of rig.joints) {
    const parentJoint = rig.parentOf.get(joint.id) ?? null;
    const label = jointGroupLabel(joint);
    const parentModule = parentJoint ? moduleOfJoint.get(parentJoint) : undefined;
    const sameLimb = parentJoint && parentModule && jointGroupLabel(rig.byId.get(parentJoint)!) === label;

    if (sameLimb) {
      moduleOfJoint.set(joint.id, parentModule);

      continue;
    }

    const id = `module:${joint.id}`;

    drafts.set(id, { id, name: uniqueName(label, names), parent: parentModule ?? MAIN_MODULE, partIds: [] });
    moduleOfJoint.set(joint.id, id);
  }

  const moduleOf = new Map<string, string>();

  for (const p of parts) {
    const owner = rig.ownerOf.get(p.id);

    moduleOf.set(p.id, (owner && moduleOfJoint.get(owner)) || MAIN_MODULE);
  }

  return { drafts: [...drafts.values()], moduleOf };
}

function groupModules(parts: ScenePart[]): { drafts: Draft[]; moduleOf: Map<string, string> } {
  const main: Draft = { id: MAIN_MODULE, name: '', parent: null, partIds: [] };
  const byGroup = new Map<string, ScenePart[]>();

  for (const p of parts) if (p.group) byGroup.set(p.group.id, [...(byGroup.get(p.group.id) ?? []), p]);

  const moduleOf = new Map<string, string>(parts.map((p) => [p.id, MAIN_MODULE]));
  const drafts: Draft[] = [main];
  const names = new Map<string, number>();

  for (const [groupId, members] of byGroup) {
    if (members.length > parts.length * GROUP_SHARE_MAX) continue;

    const id = `module:${groupId}`;

    drafts.push({ id, name: uniqueName(members[0].group!.name, names), parent: MAIN_MODULE, partIds: [] });
    members.forEach((p) => moduleOf.set(p.id, id));
  }

  return { drafts, moduleOf };
}

function foldSmallModules(drafts: Draft[], moduleOf: Map<string, string>, byId: Map<string, ScenePart>) {
  const draftById = new Map(drafts.map((d) => [d.id, d]));
  const majors = (d: Draft) => d.partIds.filter((id) => isMajor(byId.get(id)!)).length;

  for (const [partId, moduleId] of moduleOf) draftById.get(moduleId)?.partIds.push(partId);

  for (const d of [...drafts].reverse()) {
    if (d.id === MAIN_MODULE || majors(d) >= MIN_MAJORS) continue;

    const parent = draftById.get(d.parent ?? MAIN_MODULE)!;

    parent.partIds.push(...d.partIds);
    d.partIds = [];

    for (const other of drafts) if (other.parent === d.id) other.parent = parent.id;
  }

  return drafts.filter((d) => d.id === MAIN_MODULE || d.partIds.length);
}

function boxOf(ids: string[], boxes: Record<string, Box>): Box {
  return unionBox(ids.flatMap((id) => (boxes[id] ? [boxes[id]] : [])));
}

function orderModules(drafts: Draft[], boxes: Record<string, Box>): Draft[] {
  const children = (id: string) =>
    drafts
      .filter((d) => d.parent === id)
      .sort((a, b) => boxOf(a.partIds, boxes).min[1] - boxOf(b.partIds, boxes).min[1] || a.name.localeCompare(b.name));
  const out: Draft[] = [];
  const visit = (d: Draft) => {
    out.push(d);
    children(d.id).forEach(visit);
  };

  visit(drafts.find((d) => d.id === MAIN_MODULE)!);

  return out;
}

const signature = (ids: string[], byId: Map<string, ScenePart>) =>
  ids
    .map((id) => byId.get(id)!)
    .filter((p) => isMajor(p) || p.kind === 'hardware')
    .map((p) => {
      if (!itemKeyOf(p).startsWith('printed:')) return itemKeyOf(p);

      const d = p.dimensions;

      return [d.width, d.height, d.depth]
        .map((v) => Math.round(v))
        .sort((a, b) => a - b)
        .join('x');
    })
    .sort()
    .join(';');

function relativeLayout(ids: string[], boxes: Record<string, Box>): string {
  const box = boxOf(ids, boxes);
  const c = boxCenter(box);

  return ids
    .map((id) => boxCenter(boxes[id] ?? box).map((v, i) => Math.round((v - c[i]) / 2)))
    .map((v) => v.join(','))
    .sort()
    .join(';');
}

function markRepeats(modules: GuideModule[], byId: Map<string, ScenePart>, boxes: Record<string, Box>) {
  const firstBySignature = new Map<string, GuideModule>();

  for (const m of modules) {
    if (m.id === MAIN_MODULE) continue;

    const sig = `${m.parent}|${signature(m.partIds, byId)}`;
    const first = firstBySignature.get(sig);

    if (!first) {
      firstBySignature.set(sig, m);

      continue;
    }

    m.repeatOf = first.id;
    m.mirrored = relativeLayout(m.partIds, boxes) !== relativeLayout(first.partIds, boxes);

    if (!m.mirrored) first.copies += 1;
  }
}

export function buildModules(scene: GuideScene, parts: ScenePart[]): GuideModule[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const joints = scene.joints.filter((j) => [...j.parent, ...j.child].some((id) => byId.has(id)));
  const { drafts, moduleOf } = joints.length ? jointModules(joints, parts) : groupModules(parts);
  const kept = orderModules(foldSmallModules(drafts, moduleOf, byId), scene.boxes);
  const modules: GuideModule[] = kept.map((d) => ({
    id: d.id,
    name: d.name,
    parent: d.parent,
    partIds: d.partIds,
    copies: 1,
  }));

  markRepeats(modules, byId, scene.boxes);

  return modules;
}
