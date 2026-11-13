import type { RobotJoint, ScenePart } from '../types/robotics';
import { isLegJoint } from '../utils/engineeringBody';
import { buildRig, isMovable, prettyJointName, resolveJoints, type Rig, type RobotGroup } from '../utils/kinematics';
import { newId } from '../workspace/helpers';
import { PRINTED_TAG } from '../workspace/partFactories';
import { BASE_LINK, type V3, type WrapJoint, type WrapShell } from './wrapTypes';

const DEFAULT_TURN: [number, number] = [-90, 90];
const DEFAULT_SLIDE: [number, number] = [0, 0];
const MM = 1000;

export interface WrapTarget {
  mesh: ScenePart;
  robot: RobotGroup;
  rig: Rig;
}

export interface WrapPlan {
  bodies: Array<{ id: string; link: string }>;
  joints: WrapJoint[];
}

export const isWrapMesh = (p: ScenePart) =>
  p.kind === 'mesh' && !!p.mesh?.file && !p.robotLink && p.visible && p.role === 'solid';

const hasMovable = (rig: Rig, robot: RobotGroup) => robot.joints.some((id) => isMovable(rig.byId.get(id)!));

export function wrapTarget(parts: ScenePart[], joints: RobotJoint[], selectedIds: string[]): WrapTarget | null {
  const chosen = new Set(selectedIds);
  const selected = parts.filter((p) => chosen.has(p.id));
  const meshes = selected.filter(isWrapMesh);

  if (meshes.length !== 1) return null;

  const rig = buildRig(resolveJoints(joints, parts), parts);
  const keys = new Set(selected.flatMap((p) => rig.robotOf.get(p.id) ?? []));
  const robot = keys.size === 1 ? rig.robots.find((r) => keys.has(r.key)) : undefined;

  if (!robot || robot.parts.has(meshes[0].id) || !hasMovable(rig, robot)) return null;

  return { mesh: meshes[0], robot, rig };
}

const lastTarget = new WeakMap<ScenePart[], { joints: RobotJoint[]; ids: string; target: WrapTarget | null }>();

export function cachedWrapTarget(parts: ScenePart[], joints: RobotJoint[], selectedIds: string[]): WrapTarget | null {
  const ids = selectedIds.join(',');
  const known = lastTarget.get(parts);

  if (known && known.joints === joints && known.ids === ids) return known.target;

  const target = wrapTarget(parts, joints, selectedIds);

  lastTarget.set(parts, { joints, ids, target });

  return target;
}

function linkOfJoint(rig: Rig, id: string | null | undefined): string {
  let at = id ?? null;

  while (at && !isMovable(rig.byId.get(at)!)) at = rig.parentOf.get(at) ?? null;

  return at ?? BASE_LINK;
}

const isBody = (p: ScenePart) => p.visible && p.role === 'solid' && p.kind !== 'image_plane';

export function wrapPlan({ rig, robot, mesh }: WrapTarget): WrapPlan {
  const bodies = rig.parts
    .filter((p) => robot.parts.has(p.id) && p.id !== mesh.id && isBody(p))
    .map((p) => ({ id: p.id, link: linkOfJoint(rig, rig.ownerOf.get(p.id)) }));
  const joints = rig.joints
    .filter((j) => robot.joints.includes(j.id) && isMovable(j))
    .map((j): WrapJoint => ({
      id: j.id,
      type: j.type === 'prismatic' ? 'prismatic' : 'revolute',
      origin: j.origin,
      axis: j.axis,
      range: j.range ?? (j.type === 'prismatic' ? DEFAULT_SLIDE : DEFAULT_TURN),
      parentLink: linkOfJoint(rig, rig.parentOf.get(j.id)),
      floor: !(isLegJoint(j) || j.published),
    }));

  return { bodies, joints };
}

const round = (v: number) => Math.round(v * MM) / MM;

function shellPart(shell: WrapShell, mesh: ScenePart, name: string): ScenePart {
  const { positions, indices } = shell;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }

  const center = min.map((v, k) => round((v + max[k]) / 2)) as V3;
  const size = min.map((v, k) => round(max[k] - v)) as V3;

  return {
    id: newId('shell'),
    name,
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: center,
    rotation: [0, 0, 0],
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    color: mesh.color,
    note: '',
    mechanicalTag: PRINTED_TAG,
    visible: true,
    locked: false,
    mesh: {
      positions: Array.from(positions, (v, i) => round(v - center[i % 3])),
      indices: Array.from(indices),
      baseSize: size,
      source: mesh.mesh?.source,
      file: mesh.mesh?.file,
    },
  };
}

function robotGroupOf(target: WrapTarget): ScenePart['group'] {
  const groups = new Map(
    target.rig.parts.filter((p) => target.robot.parts.has(p.id)).map((p) => [p.group?.id, p.group]),
  );

  return groups.size === 1 ? [...groups.values()][0] : undefined;
}

function shellName(target: WrapTarget, link: string): string {
  const joint = target.rig.byId.get(link);

  return joint ? `${target.mesh.name} ${prettyJointName(joint.name)}` : target.mesh.name;
}

function attach(joints: RobotJoint[], shells: ScenePart[], links: string[], roots: Set<string>): RobotJoint[] {
  const byLink = new Map(links.map((link, i) => [link, shells[i].id]));
  const base = byLink.get(BASE_LINK);

  return joints.map((j) => {
    const child = byLink.get(j.id);
    const parent = base && roots.has(j.id) ? [...j.parent, base] : j.parent;

    return child || parent !== j.parent ? { ...j, child: child ? [...j.child, child] : j.child, parent } : j;
  });
}

export interface WrapEdit {
  parts: ScenePart[];
  joints: RobotJoint[];
  shells: ScenePart[];
}

export function applyWrap(
  target: WrapTarget,
  scene: { parts: ScenePart[]; joints: RobotJoint[] },
  shells: WrapShell[],
) {
  const group = robotGroupOf(target);
  const made = shells.map((s) => ({ ...shellPart(s, target.mesh, shellName(target, s.link)), group }));
  const roots = new Set(
    wrapPlan(target)
      .joints.filter((j) => j.parentLink === BASE_LINK)
      .map((j) => j.id),
  );
  const parts = scene.parts.map((p) => (p.id === target.mesh.id ? { ...p, visible: false } : p));

  return {
    parts: [...parts, ...made],
    joints: attach(
      scene.joints,
      made,
      shells.map((s) => s.link),
      roots,
    ),
    shells: made,
  } satisfies WrapEdit;
}

export interface AgentWrapChoice {
  mesh?: string;
  robot?: string;
  selectedIds: string[];
}

function chosenMesh(parts: ScenePart[], id: string | undefined): ScenePart | string {
  const meshes = parts.filter(isWrapMesh);
  const mesh = id ? meshes.find((m) => m.id === id) : meshes[0];

  if (id && !mesh) return `${id} isn't a visible imported mesh.`;

  if (!mesh) return 'No imported mesh in the scene: the user imports one with File ▸ Import Mesh.';

  return !id && meshes.length > 1 ? `Several meshes; pass mesh: ${meshes.map((m) => m.id).join(', ')}` : mesh;
}

function chosenRobot(rig: Rig, mesh: ScenePart, choice: AgentWrapChoice): RobotGroup | string {
  const robots = rig.robots.filter((r) => hasMovable(rig, r) && !r.parts.has(mesh.id));
  const named = choice.robot?.toLowerCase();
  const picked = named
    ? robots.find((r) => r.key.toLowerCase() === named || r.name.toLowerCase() === named)
    : (robots.find((r) => choice.selectedIds.some((id) => r.parts.has(id))) ??
      (robots.length === 1 ? robots[0] : null));

  if (picked) return picked;

  return robots.length ? `Pass robot: ${robots.map((r) => r.name).join(', ')}` : 'No jointed robot to wrap.';
}

export function agentWrapTarget(
  parts: ScenePart[],
  joints: RobotJoint[],
  choice: AgentWrapChoice,
): WrapTarget | string {
  const mesh = chosenMesh(parts, choice.mesh);

  if (typeof mesh === 'string') return mesh;

  const rig = buildRig(resolveJoints(joints, parts), parts);
  const robot = chosenRobot(rig, mesh, choice);

  if (typeof robot === 'string') return robot;

  return wrapTarget(parts, joints, [mesh.id, ...robot.parts]) ?? 'That robot has no joint to wrap around.';
}
