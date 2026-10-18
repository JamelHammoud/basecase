import * as THREE from 'three';
import type { RobotPoseState } from '../types/robotics';
import {
  clampJoint,
  forwardKinematics,
  isMovable,
  isRestPose,
  linkParts,
  partMotion,
  solveIK,
  type IkTarget,
  type Rig,
  type V3,
} from '../utils/kinematics';
import { goalParts, goalTargets, type IkGoal, type PointOf } from '../utils/animation';
import { detectFeet } from '../utils/usePosing';
import { autoMapRobot, KEYPOINT_LABELS, type Keypoint } from '../utils/mocap';
import { toCad, toScene } from './agentFrame';
import {
  axisName,
  fmtV,
  notesText,
  pointOfFor,
  poseCheck,
  r1,
  render,
  restPairs,
  rigOf,
  rootToCad,
  rootToScene,
  scopeOf,
  type PoseContext,
  type PoseReply,
  type Scope,
} from './agentPoseShared';

export { animateRequest, type AnimatePayload } from './agentAnimate';
export type { PoseContext, PoseReply } from './agentPoseShared';
export { retargetRequest, type RetargetPayload } from './agentRetarget';

type RigJoint = Rig['joints'][number];

function robotsHeader(full: Rig, scope: Scope): string[] {
  if (full.robots.length <= 1) return [];

  return [
    `Robots: ${full.robots.map((r) => `"${r.name}"${r.key === scope.key ? ' (this one)' : ''}`).join(', ')}. Pass robot to work on another; each keeps its own pose.`,
    '',
  ];
}

function movesText(link: string[], names: Map<string, string>): string {
  if (!link.length) return '';

  return `, moves ${link
    .slice(0, 4)
    .map((id) => names.get(id) ?? id)
    .join(', ')}${link.length > 4 ? ` +${link.length - 4}` : ''}`;
}

function jointLine(rig: Rig, j: RigJoint, names: Map<string, string>): string {
  const parent = rig.parentOf.get(j.id);
  const unit = j.type === 'prismatic' ? ' mm' : '°';

  return (
    `- ${j.id}: ${j.type} about ${axisName(j.axis)} through ${fmtV(toCad(j.origin))}` +
    `${j.range ? `, range ${j.range[0]}…${j.range[1]}${unit}` : ', no limits'}` +
    `${parent ? `, on ${parent}` : ', on the base'}` +
    movesText(linkParts(rig, j.id), names)
  );
}

function canvasPoseLine(pose: RobotPoseState): string {
  const set = Object.entries(pose.values).filter(([, v]) => Math.abs(v) > 0.05);

  if (!set.length && !pose.root) return 'Pose on the canvas: the modeled pose';

  return `Pose on the canvas: ${set.map(([k, v]) => `${k} ${r1(v)}`).join(', ')}${pose.root ? `; ${rootToCad(pose.root)}` : ''}`;
}

function libraryLines(ctx: PoseContext, scope: Scope): string[] {
  const mine = <T extends { robot?: string }>(list: T[] | undefined) =>
    (list ?? []).filter((x) => !x.robot || x.robot === scope.key);
  const poses = mine(ctx.project.poses);
  const animations = mine(ctx.project.animations);
  const lines: string[] = [];

  if (poses.length) lines.push(`Saved poses: ${poses.map((p) => p.name).join(', ')}`);

  if (animations.length)
    lines.push(
      `Animations: ${animations.map((a) => `${a.name} (${a.duration}s${a.loop ? ', loops' : ''})`).join(', ')}`,
    );

  return lines;
}

function landmarkLines(rig: Rig, pointOf: PointOf): string[] {
  const lines: string[] = [];
  const feet = detectFeet(rig, pointOf);

  if (feet) lines.push(`Feet (for gaits): ${feet.feet.join(', ')}`);

  const lm = autoMapRobot(rig);
  const known = (Object.keys(lm) as Keypoint[]).filter((k) => lm[k]);

  if (known.length)
    lines.push(`Mocap landmarks: ${known.map((k) => `${KEYPOINT_LABELS[k].toLowerCase()} = ${lm[k]}`).join(', ')}`);

  return lines;
}

export function getRig(ctx: PoseContext, wanted?: string): PoseReply {
  const full = rigOf(ctx);
  const scope = scopeOf(ctx, wanted);

  if (typeof scope === 'string') return { text: scope };

  const rig = scope.rig;
  const movable = rig.joints.filter(isMovable);
  const names = new Map(ctx.parts.map((p) => [p.id, p.name]));
  const lines = [
    ...robotsHeader(full, scope),
    `${scope.name}: ${movable.length} joints (values from the modeled pose; agent frame, mm):`,
    ...movable.map((j) => jointLine(rig, j, names)),
    '',
    canvasPoseLine(scope.local),
    ...libraryLines(ctx, scope),
    ...landmarkLines(rig, pointOfFor(full, ctx.viewport)),
  ];

  return { text: lines.join('\n') };
}

export interface PosePayload {
  robot?: string;
  values?: Record<string, number>;
  relative?: boolean;
  from_rest?: boolean;
  root?: { position?: number[]; rotation?: number[] };
  ik?: Array<{
    part: string;
    target?: number[];
    move?: number[];
    where?: 'bottom' | 'center';
    keep_orientation?: boolean;
  }>;
  apply?: string;
  save_as?: string;
  views?: string[];
}

type IkRequest = NonNullable<PosePayload['ik']>[number];

function savedPose(ctx: PoseContext, scope: Scope, apply: string): RobotPoseState | string {
  const name = apply.toLowerCase();
  const saved = ctx.project.poses?.find((x) => x.name.toLowerCase() === name && (!x.robot || x.robot === scope.key));

  if (!saved)
    return `No saved pose "${apply}". Saved: ${(ctx.project.poses ?? []).map((x) => x.name).join(', ') || 'none'}`;

  return { values: { ...saved.values }, root: saved.root };
}

function startState(ctx: PoseContext, scope: Scope, p: PosePayload): RobotPoseState | string {
  if (p.apply) return savedPose(ctx, scope, p.apply);

  return p.from_rest ? { values: {} } : { values: { ...scope.local.values }, root: scope.local.root };
}

function applyValues(rig: Rig, state: RobotPoseState, p: PosePayload, notes: string[]) {
  for (const [id, v] of Object.entries(p.values ?? {})) {
    const j = rig.byId.get(id);

    if (!j || !isMovable(j)) {
      notes.push(`No joint ${id}`);

      continue;
    }

    const want = p.relative ? (state.values[id] ?? 0) + v : v;
    const c = clampJoint(j, want);

    if (Math.abs(c - want) > 0.01)
      notes.push(`${id}: ${r1(want)} is past its range ${j.range![0]}…${j.range![1]}, held at ${r1(c)}`);

    state.values[id] = c;
  }
}

interface IkSetup {
  rig: Rig;
  posed: ReturnType<typeof forwardKinematics>;
  pointOf: PointOf;
  notes: string[];
}

function movedTarget(setup: IkSetup, g: IkRequest, move: number[], where: 'bottom' | 'center'): V3 | null {
  const { rig, posed, pointOf } = setup;
  const rest = pointOf(g.part, where);
  const part = goalParts(rig, g.part).find((x) => rig.ownerOf.has(x));
  const m = part ? partMotion(rig, posed, part) : null;

  if (!rest || !m) {
    setup.notes.push(`${g.part}: not a moving part`);

    return null;
  }

  const now = new THREE.Vector3(...rest).applyMatrix4(m);
  const d = toScene(move as V3);

  return [now.x + d[0], now.y + d[1], now.z + d[2]];
}

function ikGoal(setup: IkSetup, g: IkRequest): IkGoal | null {
  const where = g.where ?? 'center';

  if (g.target) return { part: g.part, target: toScene(g.target as V3), where, keepOrientation: g.keep_orientation };

  if (!g.move) {
    setup.notes.push(`${g.part}: give target or move`);

    return null;
  }

  const target = movedTarget(setup, g, g.move, where);

  return target ? { part: g.part, target, where, keepOrientation: g.keep_orientation } : null;
}

function applyIk(rig: Rig, state: RobotPoseState, p: PosePayload, setup: IkSetup) {
  const targets: IkTarget[] = [];
  const goals: IkGoal[] = [];

  for (const g of p.ik ?? []) {
    const goal = ikGoal(setup, g);
    const t = goal ? goalTargets(rig, goal, setup.pointOf) : null;

    if (typeof t === 'string') setup.notes.push(t);
    else if (goal && t) {
      targets.push(...t);
      goals.push(goal);
    }
  }

  const fixed = new Set(Object.keys(p.values ?? {}));
  const free = rig.joints.filter((j) => isMovable(j) && !fixed.has(j.id)).map((j) => j.id);
  const res = solveIK(rig, state.values, targets, {
    joints: free,
    root: state.root,
    prefer: state.values,
    iterations: 80,
  });

  state.values = res.values;

  let i = 0;

  for (const g of goals) {
    const e = res.errors[i] ?? 0;

    if (e > 2) setup.notes.push(`${g.part} ends ${r1(e)} mm from its target (out of reach or a joint limit)`);

    i += g.keepOrientation ? 4 : 1;
  }
}

function poseText(state: RobotPoseState, p: PosePayload, notes: string[], check: string[]): string {
  const set = Object.entries(state.values).filter(([, v]) => Math.abs(v) > 0.05);

  return (
    `${isRestPose(state) ? 'Modeled pose' : `Pose: ${set.map(([k, v]) => `${k} ${r1(v)}`).join(', ')}`}${state.root ? `; ${rootToCad(state.root)}` : ''}` +
    (p.save_as ? `\nSaved as "${p.save_as}".` : '') +
    notesText(notes) +
    (check.length ? `\nIn this pose:\n- ${check.join('\n- ')}` : '\nNo new collisions; the robot clears the floor.')
  );
}

export function setPoseRequest(ctx: PoseContext, p: PosePayload): PoseReply {
  const scope = scopeOf(ctx, p.robot);

  if (typeof scope === 'string') return { text: scope };

  const rig = scope.rig;
  const notes: string[] = [];
  const state = startState(ctx, scope, p);

  if (typeof state === 'string') return { text: state };

  applyValues(rig, state, p, notes);

  if (p.root) state.root = rootToScene(p.root);

  const pointOf = pointOfFor(rig, ctx.viewport);

  if (p.ik?.length) applyIk(rig, state, p, { rig, posed: forwardKinematics(rig, state), pointOf, notes });

  for (const k of Object.keys(state.values)) if (Math.abs(state.values[k]) < 1e-3) delete state.values[k];

  const check = poseCheck(ctx, scope, state, restPairs(ctx));
  const images = p.views?.length ? render(ctx, scope, [{ label: '', state }], p.views) : undefined;
  const merged = scope.merge(state);

  ctx.setPose(isRestPose(merged) ? null : merged);

  if (p.save_as) ctx.savePose(p.save_as, { ...state, robot: scope.key } as RobotPoseState);

  return { text: poseText(state, p, notes, check), images };
}
