import type { RobotAnimation } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import {
  buildGait,
  buildKeyframes,
  sampleAnimation,
  type GaitSpec,
  type KeyframeSpec,
  type PointOf,
} from '../utils/animation';
import { detectFeet } from '../utils/usePosing';
import { toScene } from './agentFrame';
import {
  notesText,
  pointOfFor,
  poseCheck,
  previewStates,
  r1,
  render,
  restore,
  restPairs,
  rootToScene,
  scopeOf,
  type PoseContext,
  type PoseReply,
  type Scope,
} from './agentPoseShared';

export interface AnimatePayload {
  robot?: string;
  name: string;
  duration?: number;
  loop?: boolean;
  interpolation?: 'smooth' | 'linear';
  keyframes?: Array<{
    t: number;
    values?: Record<string, number>;
    root?: { position?: number[]; rotation?: number[] };
    ik?: Array<{ part: string; target: number[]; where?: 'bottom' | 'center'; keep_orientation?: boolean }>;
  }>;
  gait?: Omit<GaitSpec, 'feet' | 'oscillators'> & { feet?: string[]; oscillators?: GaitSpec['oscillators'] };
  play?: boolean;
  preview?: { frames?: number; view?: string };
}

interface Built {
  anim: RobotAnimation;
  notes: string[];
  ikError: Record<string, number>;
}

function rescaled(anim: RobotAnimation, duration: number | undefined): RobotAnimation {
  if (!duration || duration === anim.duration) return anim;

  const k = duration / anim.duration;

  return {
    ...anim,
    duration,
    keyframes: anim.keyframes.map((f) => ({ ...f, t: Math.round(f.t * k * 1000) / 1000 })),
  };
}

function gaitAnimation(
  rig: Rig,
  p: AnimatePayload,
  gait: NonNullable<AnimatePayload['gait']>,
  pointOf: PointOf,
): Built | string {
  const auto = gait.feet?.length ? null : detectFeet(rig, pointOf);
  const feet = gait.feet?.length ? gait.feet : auto?.feet;

  if (!feet?.length)
    return 'Couldn’t find the feet. Pass gait.feet: the ankle joint (or foot part) of each leg, front left first.';

  const built = buildGait(
    rig,
    { ...gait, feet, phases: gait.phases ?? auto?.phases },
    { values: {} },
    { pointOf, name: p.name },
  );

  if (typeof built === 'string') return built;

  return { anim: rescaled(built.animation, p.duration), notes: built.notes, ikError: built.ikError };
}

function keyframeAnimation(scope: Scope, p: AnimatePayload, pointOf: PointOf): Built | string {
  if (!p.keyframes?.length) return 'Give keyframes, or a gait.';

  const specs: KeyframeSpec[] = p.keyframes.map((k) => ({
    t: k.t,
    values: k.values,
    root: rootToScene(k.root),
    ik: k.ik?.map((g) => ({
      part: g.part,
      target: toScene(g.target as V3),
      where: g.where,
      keepOrientation: g.keep_orientation,
    })),
  }));
  const built = buildKeyframes(
    scope.rig,
    specs,
    { values: { ...scope.local.values }, root: scope.local.root },
    pointOf,
  );
  const last = built.keyframes[built.keyframes.length - 1]?.t ?? 1;

  return {
    anim: {
      id: '',
      name: p.name,
      duration: Math.max(p.duration ?? last, last, 0.1),
      loop: p.loop ?? false,
      keyframes: built.keyframes,
      interpolation: p.interpolation ?? 'smooth',
      source: 'agent',
    },
    notes: built.notes,
    ikError: built.ikError,
  };
}

function collisionProblems(ctx: PoseContext, scope: Scope, anim: RobotAnimation, problems: Map<string, string>) {
  const rest = restPairs(ctx);
  const samples = 8;

  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * anim.duration;

    for (const line of poseCheck(ctx, scope, sampleAnimation(anim, t), rest)) {
      const key = line.replace(/[\d.]+ mm/g, '');

      if (!problems.has(key)) problems.set(key, `${line} at ${r1(t)} s`);
    }
  }
}

function fastestSpeeds(anim: RobotAnimation): Map<string, number> {
  const steps = 120;
  const fastest = new Map<string, number>();
  let prev = sampleAnimation(anim, 0);

  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * anim.duration;
    const cur = sampleAnimation(anim, t);
    const dt = anim.duration / steps;

    for (const [id, v] of Object.entries(cur.values)) {
      const speed = Math.abs(v - (prev.values[id] ?? 0)) / dt;

      if (speed > (fastest.get(id) ?? 0)) fastest.set(id, speed);
    }

    prev = cur;
  }

  return fastest;
}

function speedProblems(scope: Scope, anim: RobotAnimation, problems: Map<string, string>) {
  for (const [id, speed] of fastestSpeeds(anim)) {
    const j = scope.rig.byId.get(id);

    if (!j?.velocity || speed <= j.velocity) continue;

    const unit = j.type === 'prismatic' ? ' mm' : '°';

    problems.set(
      `speed ${id}`,
      `${id} moves at ${Math.round(speed)}${unit}/s, past the maker’s ${Math.round(j.velocity)}${unit}/s: lengthen the animation or soften the motion`,
    );
  }
}

function animateText(made: RobotAnimation, p: AnimatePayload, built: Built, problems: Map<string, string>): string {
  const joints = new Set(made.keyframes.flatMap((k) => Object.keys(k.values)));
  const ik = Object.entries(built.ikError).map(([k, v]) => `${k} within ${r1(v)} mm`);

  return (
    `${made.name}: ${made.duration} s, ${made.keyframes.length} keyframes, ${joints.size} joints${made.loop ? ', loops' : ''}${p.play !== false ? ', playing' : ''}.` +
    (ik.length ? `\nIK: ${ik.join(', ')}` : '') +
    notesText(built.notes) +
    (problems.size
      ? `\nDuring the motion:\n- ${[...problems.values()].join('\n- ')}`
      : '\nNo collisions between links and nothing below the floor at 8 sampled times.')
  );
}

export function animateRequest(ctx: PoseContext, p: AnimatePayload): PoseReply {
  const scope = scopeOf(ctx, p.robot);

  if (typeof scope === 'string') return { text: scope };

  const pointOf = pointOfFor(scope.rig, ctx.viewport);
  const built = p.gait ? gaitAnimation(scope.rig, p, p.gait, pointOf) : keyframeAnimation(scope, p, pointOf);

  if (typeof built === 'string') return { text: built };

  const anim = built.anim;

  if (p.loop !== undefined) anim.loop = p.loop;

  const problems = new Map<string, string>();

  collisionProblems(ctx, scope, anim, problems);
  speedProblems(scope, anim, problems);

  const images = p.preview
    ? render(ctx, scope, previewStates(anim, p.preview.frames, anim.loop), [p.preview.view ?? 'side'])
    : undefined;

  restore(ctx, scope);

  const made = ctx.addAnimation({ ...anim, robot: scope.key });

  if (p.play !== false) ctx.play(made.id);

  return { text: animateText(made, p, built, problems), images };
}
