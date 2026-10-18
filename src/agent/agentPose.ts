import * as THREE from 'three';
import type { ProjectSettings, RobotAnimation, RobotPoseState, RootOffset, ScenePart } from '../types/robotics';
import type { Viewport3DHandle } from '../components/Viewport3D';
import {
  buildRig,
  clampJoint,
  forwardKinematics,
  isMovable,
  isRestPose,
  linkParts,
  partMotion,
  poseDeltas,
  resolveJoints,
  solveIK,
  type IkTarget,
  type Rig,
  type V3,
} from '../utils/kinematics';
import { buildGait, buildKeyframes, goalParts, goalTargets, sampleAnimation, type GaitSpec, type IkGoal, type KeyframeSpec, type PointOf } from '../utils/animation';
import { detectFeet } from '../utils/usePosing';
import { autoMapBones, autoMapRobot, KEYPOINT_LABELS, parseBvh, retarget, type Keypoint } from '../utils/mocap';
import { rotToCad, rotToScene, toCad, toScene } from './agentScene';

/**
 * The agent's posing tools (get_rig, pose, animate, retarget_motion), in the agent frame:
 * mm, Z up, front −Y, left +X. Joint values are degrees (revolute) or mm (prismatic) from
 * the modeled pose.
 */

export interface PoseContext {
  parts: ScenePart[];
  project: ProjectSettings;
  viewport: Viewport3DHandle | null;
  setPose: (state: RobotPoseState | null) => void;
  savePose: (name: string, state: RobotPoseState) => void;
  addAnimation: (anim: RobotAnimation) => RobotAnimation;
  play: (id: string) => void;
}

export interface PoseReply {
  text: string;
  images?: Array<{ view: string; dataUrl: string }>;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const fmtV = (v: V3) => `[${v.map((x) => r1(Object.is(r1(x), -0) ? 0 : x)).join(', ')}]`;
const axisName = (a: V3) => {
  const c = toCad(a);
  const i = c.map(Math.abs).indexOf(Math.max(...c.map(Math.abs)));
  return Math.abs(c[i]) > 0.98 ? `${c[i] > 0 ? '+' : '−'}${'XYZ'[i]}` : fmtV(c.map((x) => Math.round(x * 100) / 100) as V3);
};

function rigOf(ctx: PoseContext): Rig {
  return buildRig(resolveJoints(ctx.project.joints ?? [], ctx.parts), ctx.parts);
}

function pointOfFor(rig: Rig, viewport: Viewport3DHandle | null): PointOf {
  return (id, where) => {
    const ids = goalParts(rig, id);
    const b = viewport?.restBounds(ids.length ? ids : [id]);
    if (!b) return null;
    const c: V3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    return where === 'bottom' ? [c[0], b.min[1], c[2]] : c;
  };
}

const rootToScene = (root?: { position?: number[]; rotation?: number[] }): RootOffset | undefined =>
  root ? { position: root.position ? toScene(root.position as V3) : undefined, rotation: root.rotation ? rotToScene(root.rotation as V3) : undefined } : undefined;
const rootToCad = (root?: RootOffset) =>
  root && !isRestPose({ values: {}, root }) ? `body offset ${fmtV(toCad(root.position ?? [0, 0, 0]))} mm, turned ${fmtV(rotToCad(root.rotation ?? [0, 0, 0]))}°` : '';

/** What changes when the robot takes a pose: new clashes between links, and the floor */
function poseCheck(ctx: PoseContext, rig: Rig, state: RobotPoseState, restPairs: Set<string>): string[] {
  const vp = ctx.viewport;
  if (!vp) return [];
  vp.setPose(poseDeltas(rig, state, ctx.parts.map((p) => p.id)));
  const lines: string[] = [];
  const owner = (id: string) => rig.ownerOf.get(id) ?? 'base';
  const clashes = vp
    .posedInterference()
    .filter((f) => f.depthMm > 1 && owner(f.a) !== owner(f.b) && !restPairs.has([f.a, f.b].sort().join('|')));
  for (const c of clashes.slice(0, 6)) lines.push(`${c.a} passes ${r1(c.depthMm)} mm into ${c.b}`);
  const floor = vp.posedFloor();
  if (floor !== null && floor < -1) lines.push(`${r1(-floor)} mm below the floor`);
  else if (floor !== null && floor > 5 && rig.joints.some((j) => /knee|ankle|leg|foot/i.test(j.name))) lines.push(`Lowest point ${r1(floor)} mm above the floor`);
  return lines;
}

function restPairs(ctx: PoseContext): Set<string> {
  const found = ctx.viewport?.interference().interferences ?? [];
  return new Set(found.map((f) => [f.a, f.b].sort().join('|')));
}

/** Renders the pose (or animation frames) and puts the canvas back */
function render(ctx: PoseContext, rig: Rig, states: Array<{ label: string; state: RobotPoseState }>, views: string[]): Array<{ view: string; dataUrl: string }> {
  const vp = ctx.viewport;
  if (!vp) return [];
  const ids = ctx.parts.map((p) => p.id);
  const out: Array<{ view: string; dataUrl: string }> = [];
  for (const s of states) {
    vp.setPose(poseDeltas(rig, s.state, ids));
    for (const shot of vp.captureViews(views)) out.push({ view: `${s.label}${s.label ? ' · ' : ''}${shot.view}`, dataUrl: shot.dataUrl });
  }
  return out;
}

function restore(ctx: PoseContext, rig: Rig) {
  ctx.viewport?.setPose(poseDeltas(rig, ctx.project.pose, ctx.parts.map((p) => p.id)));
}

/* ------------------------------------------------------------------ */

export function getRig(ctx: PoseContext): PoseReply {
  const rig = rigOf(ctx);
  const movable = rig.joints.filter(isMovable);
  if (!movable.length) return { text: 'No joints yet. Declare them with define_joints (or import_robot a published robot).' };
  const pointOf = pointOfFor(rig, ctx.viewport);
  const names = new Map(ctx.parts.map((p) => [p.id, p.name]));
  const lines = [`${movable.length} joints (values from the modeled pose; agent frame, mm):`];
  for (const j of movable) {
    const parent = rig.parentOf.get(j.id);
    const link = linkParts(rig, j.id);
    const unit = j.type === 'prismatic' ? ' mm' : '°';
    lines.push(
      `- ${j.id}: ${j.type} about ${axisName(j.axis)} through ${fmtV(toCad(j.origin))}` +
        `${j.range ? `, range ${j.range[0]}…${j.range[1]}${unit}` : ', no limits'}` +
        `${parent ? `, on ${parent}` : ', on the base'}` +
        `${link.length ? `, moves ${link.slice(0, 4).map((id) => names.get(id) ?? id).join(', ')}${link.length > 4 ? ` +${link.length - 4}` : ''}` : ''}`
    );
  }
  const pose = ctx.project.pose;
  const set = Object.entries(pose?.values ?? {}).filter(([, v]) => Math.abs(v) > 0.05);
  lines.push('', set.length || pose?.root ? `Pose on the canvas: ${set.map(([k, v]) => `${k} ${r1(v)}`).join(', ')}${pose?.root ? `; ${rootToCad(pose.root)}` : ''}` : 'Pose on the canvas: the modeled pose');
  if (ctx.project.poses?.length) lines.push(`Saved poses: ${ctx.project.poses.map((p) => p.name).join(', ')}`);
  if (ctx.project.animations?.length) lines.push(`Animations: ${ctx.project.animations.map((a) => `${a.name} (${a.duration}s${a.loop ? ', loops' : ''})`).join(', ')}`);
  const feet = detectFeet(rig, pointOf);
  if (feet) lines.push(`Feet (for gaits): ${feet.feet.join(', ')}`);
  const lm = autoMapRobot(rig);
  const known = (Object.keys(lm) as Keypoint[]).filter((k) => lm[k]);
  if (known.length) lines.push(`Mocap landmarks: ${known.map((k) => `${KEYPOINT_LABELS[k].toLowerCase()} = ${lm[k]}`).join(', ')}`);
  return { text: lines.join('\n') };
}

export interface PosePayload {
  values?: Record<string, number>;
  relative?: boolean;
  from_rest?: boolean;
  root?: { position?: number[]; rotation?: number[] };
  ik?: Array<{ part: string; target?: number[]; move?: number[]; where?: 'bottom' | 'center'; keep_orientation?: boolean }>;
  apply?: string;
  save_as?: string;
  views?: string[];
}

export function setPoseRequest(ctx: PoseContext, p: PosePayload): PoseReply {
  const rig = rigOf(ctx);
  if (!rig.joints.some(isMovable)) return { text: 'No joints to pose. Declare them with define_joints first.' };
  const notes: string[] = [];
  let state: RobotPoseState = p.from_rest ? { values: {} } : { values: { ...ctx.project.pose?.values }, root: ctx.project.pose?.root };
  if (p.apply) {
    const saved = ctx.project.poses?.find((x) => x.name.toLowerCase() === p.apply!.toLowerCase());
    if (!saved) return { text: `No saved pose "${p.apply}". Saved: ${(ctx.project.poses ?? []).map((x) => x.name).join(', ') || 'none'}` };
    state = { values: { ...saved.values }, root: saved.root };
  }
  for (const [id, v] of Object.entries(p.values ?? {})) {
    const j = rig.byId.get(id);
    if (!j || !isMovable(j)) {
      notes.push(`No joint ${id}`);
      continue;
    }
    const want = p.relative ? (state.values[id] ?? 0) + v : v;
    const c = clampJoint(j, want);
    if (Math.abs(c - want) > 0.01) notes.push(`${id}: ${r1(want)} is past its range ${j.range![0]}…${j.range![1]}, held at ${r1(c)}`);
    state.values[id] = c;
  }
  if (p.root) state.root = rootToScene(p.root);
  const pointOf = pointOfFor(rig, ctx.viewport);
  if (p.ik?.length) {
    const targets: IkTarget[] = [];
    const goals: IkGoal[] = [];
    const posed = forwardKinematics(rig, state);
    for (const g of p.ik) {
      const where = g.where ?? 'center';
      let target: V3 | null = g.target ? toScene(g.target as V3) : null;
      if (!target && g.move) {
        // From where that point is now
        const rest = pointOf(g.part, where);
        const part = goalParts(rig, g.part).find((x) => rig.ownerOf.has(x));
        const m = part ? partMotion(rig, posed, part) : null;
        if (!rest || !m) {
          notes.push(`${g.part}: not a moving part`);
          continue;
        }
        const now = new THREE.Vector3(...rest).applyMatrix4(m);
        const d = toScene(g.move as V3);
        target = [now.x + d[0], now.y + d[1], now.z + d[2]];
      }
      if (!target) {
        notes.push(`${g.part}: give target or move`);
        continue;
      }
      const goal: IkGoal = { part: g.part, target, where, keepOrientation: g.keep_orientation };
      const t = goalTargets(rig, goal, pointOf);
      if (typeof t === 'string') notes.push(t);
      else {
        targets.push(...t);
        goals.push(goal);
      }
    }
    const fixed = new Set(Object.keys(p.values ?? {}));
    const free = rig.joints.filter((j) => isMovable(j) && !fixed.has(j.id)).map((j) => j.id);
    const res = solveIK(rig, state.values, targets, { joints: free, root: state.root, prefer: state.values, iterations: 80 });
    state.values = res.values;
    let i = 0;
    for (const g of goals) {
      const e = res.errors[i] ?? 0;
      if (e > 2) notes.push(`${g.part} ends ${r1(e)} mm from its target (out of reach or a joint limit)`);
      i += g.keepOrientation ? 4 : 1;
    }
  }
  for (const k of Object.keys(state.values)) if (Math.abs(state.values[k]) < 1e-3) delete state.values[k];
  const check = poseCheck(ctx, rig, state, restPairs(ctx));
  const images = p.views?.length ? render(ctx, rig, [{ label: '', state }], p.views) : undefined;
  ctx.setPose(isRestPose(state) ? null : state);
  if (p.save_as) ctx.savePose(p.save_as, state);
  const set = Object.entries(state.values).filter(([, v]) => Math.abs(v) > 0.05);
  return {
    text:
      `${isRestPose(state) ? 'Modeled pose' : `Pose: ${set.map(([k, v]) => `${k} ${r1(v)}`).join(', ')}`}${state.root ? `; ${rootToCad(state.root)}` : ''}` +
      (p.save_as ? `\nSaved as "${p.save_as}".` : '') +
      (notes.length ? `\nNotes:\n- ${notes.join('\n- ')}` : '') +
      (check.length ? `\nIn this pose:\n- ${check.join('\n- ')}` : '\nNo new collisions; the robot clears the floor.'),
    images,
  };
}

export interface AnimatePayload {
  name: string;
  duration?: number;
  loop?: boolean;
  interpolation?: 'smooth' | 'linear';
  keyframes?: Array<{ t: number; values?: Record<string, number>; root?: { position?: number[]; rotation?: number[] }; ik?: Array<{ part: string; target: number[]; where?: 'bottom' | 'center'; keep_orientation?: boolean }> }>;
  gait?: Omit<GaitSpec, 'feet' | 'oscillators'> & { feet?: string[]; oscillators?: GaitSpec['oscillators'] };
  play?: boolean;
  preview?: { frames?: number; view?: string };
}

export function animateRequest(ctx: PoseContext, p: AnimatePayload): PoseReply {
  const rig = rigOf(ctx);
  if (!rig.joints.some(isMovable)) return { text: 'No joints to animate. Declare them with define_joints first.' };
  const pointOf = pointOfFor(rig, ctx.viewport);
  let anim: RobotAnimation;
  let notes: string[] = [];
  let ikError: Record<string, number> = {};
  if (p.gait) {
    const auto = p.gait.feet?.length ? null : detectFeet(rig, pointOf);
    const feet = p.gait.feet?.length ? p.gait.feet : auto?.feet;
    if (!feet?.length) return { text: 'Couldn’t find the feet. Pass gait.feet: the ankle joint (or foot part) of each leg, front left first.' };
    const built = buildGait(rig, { ...p.gait, feet, phases: p.gait.phases ?? auto?.phases }, { values: {} }, pointOf, p.name);
    if (typeof built === 'string') return { text: built };
    anim = built.animation;
    notes = built.notes;
    ikError = built.ikError;
    if (p.duration && p.duration !== anim.duration) {
      const k = p.duration / anim.duration;
      anim = { ...anim, duration: p.duration, keyframes: anim.keyframes.map((f) => ({ ...f, t: Math.round(f.t * k * 1000) / 1000 })) };
    }
  } else {
    if (!p.keyframes?.length) return { text: 'Give keyframes, or a gait.' };
    const specs: KeyframeSpec[] = p.keyframes.map((k) => ({
      t: k.t,
      values: k.values,
      root: rootToScene(k.root),
      ik: k.ik?.map((g) => ({ part: g.part, target: toScene(g.target as V3), where: g.where, keepOrientation: g.keep_orientation })),
    }));
    const built = buildKeyframes(rig, specs, { values: { ...ctx.project.pose?.values }, root: ctx.project.pose?.root }, pointOf);
    notes = built.notes;
    ikError = built.ikError;
    const last = built.keyframes[built.keyframes.length - 1]?.t ?? 1;
    anim = {
      id: '',
      name: p.name,
      duration: Math.max(p.duration ?? last, last, 0.1),
      loop: p.loop ?? false,
      keyframes: built.keyframes,
      interpolation: p.interpolation ?? 'smooth',
      source: 'agent',
    };
  }
  if (p.loop !== undefined) anim.loop = p.loop;

  // Sample the motion: collisions between links, the floor, and feet sliding while planted
  const rest = restPairs(ctx);
  const samples = 8;
  const problems = new Map<string, string>();
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * anim.duration;
    for (const line of poseCheck(ctx, rig, sampleAnimation(anim, t), rest)) {
      const key = line.replace(/[\d.]+ mm/g, '');
      if (!problems.has(key)) problems.set(key, `${line} at ${r1(t)} s`);
    }
  }
  let images: PoseReply['images'];
  if (p.preview) {
    const n = Math.min(Math.max(p.preview.frames ?? 4, 2), 8);
    images = render(
      ctx,
      rig,
      Array.from({ length: n }, (_, i) => {
        const t = (i / (anim.loop ? n : n - 1)) * anim.duration;
        return { label: `${r1(t)} s`, state: sampleAnimation(anim, t) };
      }),
      [p.preview.view ?? 'side']
    );
  }
  restore(ctx, rig);
  const made = ctx.addAnimation(anim);
  if (p.play !== false) ctx.play(made.id);
  const joints = new Set(made.keyframes.flatMap((k) => Object.keys(k.values)));
  const ik = Object.entries(ikError).map(([k, v]) => `${k} within ${r1(v)} mm`);
  return {
    text:
      `${made.name}: ${made.duration} s, ${made.keyframes.length} keyframes, ${joints.size} joints${made.loop ? ', loops' : ''}${p.play !== false ? ', playing' : ''}.` +
      (ik.length ? `\nIK: ${ik.join(', ')}` : '') +
      (notes.length ? `\nNotes:\n- ${notes.join('\n- ')}` : '') +
      (problems.size ? `\nDuring the motion:\n- ${[...problems.values()].join('\n- ')}` : '\nNo collisions between links and nothing below the floor at 8 sampled times.'),
    images,
  };
}

export interface RetargetPayload {
  text?: string;
  url?: string;
  file?: string;
  name?: string;
  start?: number;
  end?: number;
  fps?: number;
  in_place?: boolean;
  loop?: boolean;
  bones?: Partial<Record<Keypoint, string>>;
  joints?: Partial<Record<Keypoint, string>>;
  play?: boolean;
  preview?: { frames?: number; view?: string };
}

export async function retargetRequest(ctx: PoseContext, p: RetargetPayload): Promise<PoseReply> {
  const rig = rigOf(ctx);
  if (!rig.joints.some(isMovable)) return { text: 'No joints to retarget onto. Declare them with define_joints, or import_robot.' };
  let text = p.text;
  if (!text && p.url) {
    const res = await fetch(p.url);
    if (!res.ok) return { text: `Couldn’t download the BVH (${res.status}).` };
    text = await res.text();
  }
  if (!text) return { text: 'Give the BVH as an evidence path or a URL.' };
  const name = p.name ?? (p.file ?? p.url ?? 'Motion').split('/').pop()!.replace(/\.bvh$/i, '');
  let mocap;
  try {
    mocap = parseBvh(text, name);
  } catch (err) {
    return { text: `Couldn’t read the BVH: ${err instanceof Error ? err.message : String(err)}` };
  }
  const pointOf = pointOfFor(rig, ctx.viewport);
  const res = retarget(mocap, rig, pointOf, { bones: p.bones, joints: p.joints, fps: p.fps, start: p.start, end: p.end, inPlace: p.in_place, loop: p.loop, name });
  if (typeof res === 'string') {
    const bones = autoMapBones(mocap);
    return { text: `${res}\nBVH bones: ${mocap.bones.join(', ')}\nAuto-matched: ${Object.entries(bones).map(([k, v]) => `${k}=${v}`).join(', ')}` };
  }
  let images: PoseReply['images'];
  if (p.preview) {
    const n = Math.min(Math.max(p.preview.frames ?? 4, 2), 8);
    images = render(
      ctx,
      rig,
      Array.from({ length: n }, (_, i) => {
        const t = (i / (n - 1)) * res.animation.duration;
        return { label: `${r1(t)} s`, state: sampleAnimation(res.animation, t) };
      }),
      [p.preview.view ?? 'iso']
    );
    restore(ctx, rig);
  }
  const made = ctx.addAnimation(res.animation);
  if (p.play !== false) ctx.play(made.id);
  return {
    text:
      `${made.name}: ${made.duration} s from ${mocap.duration.toFixed(1)} s of motion (${mocap.bones.length} bones), ${made.keyframes.length} keyframes.` +
      `\nMatched: ${res.mapped.map((m) => `${KEYPOINT_LABELS[m.keypoint].toLowerCase()} ${m.bone} → ${m.joint}`).join('; ')}` +
      `\nMean miss per landmark: ${Object.entries(res.error).map(([k, v]) => `${KEYPOINT_LABELS[k as Keypoint].toLowerCase()} ${v} mm`).join(', ')}` +
      (res.notes.length ? `\nNotes:\n- ${res.notes.join('\n- ')}` : ''),
    images,
  };
}
