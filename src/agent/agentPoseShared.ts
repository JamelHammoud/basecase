import type { ProjectSettings, RobotAnimation, RobotPoseState, RootOffset, ScenePart } from '../types/robotics';
import type { Viewport3DHandle } from '../components/Viewport3D';
import {
  buildRig,
  isRestPose,
  poseDeltas,
  robotOfParts,
  robotPose,
  robotRig,
  withRobotPose,
  type Rig,
  type V3,
} from '../utils/kinematics';
import { goalParts, sampleAnimation, type PointOf } from '../utils/animation';
import { limbOf } from '../utils/robotImport/published';
import { rigJoints } from '../assembly/rigJoints';
import { DEEPER_THAN_REST_MM, pairKey } from '../three/interference';
import { rotToCad, rotToScene, toCad, toScene } from './agentFrame';
import { runClock } from '../utils/duration';
import { lengthLabel } from '../utils/size';
import { plural } from '../../electron/plural.mjs';

export interface PoseContext {
  parts: ScenePart[];
  project: ProjectSettings;
  viewport: Viewport3DHandle | null;
  setPose: (state: RobotPoseState | null) => void;
  savePose: (name: string, state: RobotPoseState) => void;
  addAnimation: (anim: RobotAnimation) => RobotAnimation;
  play: (id: string) => void;
  selectedIds: string[];
}

export interface Scope {
  full: Rig;
  rig: Rig;
  key: string;
  name: string;
  local: RobotPoseState;
  merge: (local: RobotPoseState) => RobotPoseState;
}

export function scopeOf(ctx: PoseContext, wanted?: string): Scope | string {
  const full = rigOf(ctx);

  if (!full.robots.length) return 'No joints. Declare them with define_joints (or import_robot a published robot).';

  const w = wanted?.trim().toLowerCase();
  const group = w
    ? (full.robots.find((r) => r.key.toLowerCase() === w || r.name.toLowerCase() === w) ??
      full.robots.find((r) => r.name.toLowerCase().includes(w)))
    : (robotOfParts(full, ctx.selectedIds) ?? (full.robots.length === 1 ? full.robots[0] : null));

  if (!group) {
    const list = full.robots.map((r) => `"${r.name}" (${plural(r.joints.length, 'joint')})`).join(', ');

    return w
      ? `No robot "${wanted}". Robots: ${list}.`
      : `${full.robots.length} robots in the scene: ${list}. Pass robot to say which.`;
  }

  return {
    full,
    rig: robotRig(full, group.key),
    key: group.key,
    name: group.name,
    local: robotPose(full, ctx.project.pose, group.key),
    merge: (local) => withRobotPose(full, ctx.project.pose, group.key, local),
  };
}

export interface PoseReply {
  text: string;
  images?: Array<{ view: string; dataUrl: string }>;
}

export const TOOL_IMAGE_SIDE = 768;

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const fmtV = (v: V3) => `[${v.map((x) => r1(Object.is(r1(x), -0) ? 0 : x)).join(', ')}]`;
export const axisName = (a: V3) => {
  const c = toCad(a);
  const i = c.map(Math.abs).indexOf(Math.max(...c.map(Math.abs)));

  return Math.abs(c[i]) > 0.98
    ? `${c[i] > 0 ? '+' : '−'}${'XYZ'[i]}`
    : fmtV(c.map((x) => Math.round(x * 100) / 100) as V3);
};

export function rigOf(ctx: PoseContext): Rig {
  return buildRig(rigJoints(ctx.project.joints ?? [], ctx.parts), ctx.parts);
}

export function pointOfFor(rig: Rig, viewport: Viewport3DHandle | null): PointOf {
  return (id, where) => {
    const ids = goalParts(rig, id);
    const b = viewport?.restBounds(ids.length ? ids : [id]);

    if (!b) return null;

    const c: V3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];

    return where === 'bottom' ? [c[0], b.min[1], c[2]] : c;
  };
}

export const rootToScene = (root?: { position?: number[]; rotation?: number[] }): RootOffset | undefined =>
  root
    ? {
        position: root.position ? toScene(root.position as V3) : undefined,
        rotation: root.rotation ? rotToScene(root.rotation as V3) : undefined,
      }
    : undefined;
export const rootToCad = (root?: RootOffset) =>
  root && !isRestPose({ values: {}, root })
    ? `body offset ${fmtV(toCad(root.position ?? [0, 0, 0]))} mm, turned ${fmtV(rotToCad(root.rotation ?? [0, 0, 0]))}°`
    : '';

function outputRiders(rig: Rig, parts: string[]): Record<string, string[]> {
  const owner = (id: string) => rig.ownerOf.get(id) ?? 'base';
  const riders: Record<string, string[]> = {};

  for (const j of rig.joints) {
    for (const servo of j.actuators ?? []) {
      const side = owner(servo) === j.id ? (rig.parentOf.get(j.id) ?? 'base') : j.id;

      riders[servo] = [...(riders[servo] ?? []), ...parts.filter((id) => id !== servo && owner(id) === side)];
    }
  }

  return riders;
}

const CLASHES_SHOWN = 6;

export async function poseCheck(
  ctx: PoseContext,
  scope: Scope,
  local: RobotPoseState,
  restPairs: Promise<Map<string, number>>,
): Promise<string[]> {
  const vp = ctx.viewport;

  if (!vp) return [];

  const rig = scope.rig;

  vp.setPose(
    poseDeltas(
      scope.full,
      scope.merge(local),
      ctx.parts.map((p) => p.id),
    ),
  );

  const lines: string[] = [];
  const owner = (id: string) => rig.ownerOf.get(id) ?? 'base';
  const robotParts = [...(scope.full.robots.find((r) => r.key === scope.key)?.parts ?? [])];
  const found = vp.posedInterference(robotParts, outputRiders(rig, robotParts));
  const lowest = vp.posedFloor(robotParts);
  const rest = await restPairs;
  const floor = await lowest;
  const clashes = (await found).filter(
    (f) =>
      f.depthMm > 1 &&
      owner(f.a) !== owner(f.b) &&
      f.depthMm > (rest.get(pairKey(f.a, f.b)) ?? -DEEPER_THAN_REST_MM) + DEEPER_THAN_REST_MM,
  );

  for (const c of clashes.slice(0, CLASHES_SHOWN)) lines.push(`${c.a} passes ${lengthLabel(c.depthMm)} into ${c.b}`);

  if (clashes.length > CLASHES_SHOWN) lines.push(`…and ${clashes.length - CLASHES_SHOWN} more clashes`);

  if (floor !== null && floor < -1) lines.push(`${lengthLabel(-floor)} below the floor`);
  else if (floor !== null && floor > 5 && rig.joints.some((j) => (j.limb ?? limbOf(j.name)) === 'leg'))
    lines.push(`Lowest point ${lengthLabel(floor)} above the floor`);

  return lines;
}

export async function restPairs(ctx: PoseContext): Promise<Map<string, number>> {
  const found = (await ctx.viewport?.interference())?.interferences ?? [];

  return new Map(found.map((f) => [pairKey(f.a, f.b), f.depthMm]));
}

export function render(
  ctx: PoseContext,
  scope: Scope,
  states: Array<{ label: string; state: RobotPoseState }>,
  views: string[],
): Promise<Array<{ view: string; dataUrl: string }>> {
  const vp = ctx.viewport;

  if (!vp) return Promise.resolve([]);

  const ids = ctx.parts.map((p) => p.id);
  const shots = states.map((s) => {
    vp.setPose(poseDeltas(scope.full, scope.merge(s.state), ids));

    return vp
      .captureViews(views, undefined, { maxSide: TOOL_IMAGE_SIDE })
      .then((taken) =>
        taken.map((shot) => ({ view: `${s.label}${s.label ? ' · ' : ''}${shot.view}`, dataUrl: shot.dataUrl })),
      );
  });

  return Promise.all(shots).then((all) => all.flat());
}

export function restore(ctx: PoseContext, scope: Scope) {
  ctx.viewport?.setPose(
    poseDeltas(
      scope.full,
      ctx.project.pose,
      ctx.parts.map((p) => p.id),
    ),
  );
}

export function previewStates(
  anim: RobotAnimation,
  frames: number | undefined,
  cyclic: boolean,
): Array<{ label: string; state: RobotPoseState }> {
  const n = Math.min(Math.max(frames ?? 4, 2), 8);

  return Array.from({ length: n }, (_, i) => {
    const t = (i / (cyclic ? n : n - 1)) * anim.duration;

    return { label: runClock(t), state: sampleAnimation(anim, t) };
  });
}

export const notesText = (notes: string[]) => (notes.length ? `\nNotes:\n- ${notes.join('\n- ')}` : '');
