import type * as THREE from 'three';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Controller } from '../sim/engine';
import type { SimRun, Simulation } from '../sim/useSimulation';
import type { Training } from '../sim/useTraining';
import { cameraShots } from '../cameras/cameraShots';
import type { FixedCamera } from '../cameras/fixed';
import type { PolicyRecord, RobotAnimation, ScenePart } from '../types/robotics';
import { prettyJointName, type Rig } from '../utils/kinematics';
import type { PoseReply } from './agentPose';
import { TOOL_IMAGE_SIDE } from './agentPoseShared';
import { errorMessage } from '../utils/errorMessage';
import { duration, runClock } from '../utils/duration';
import { plural } from '../../electron/plural.mjs';

export interface SimulatePayload {
  seconds?: number;
  controller?: string;
  pushes?: Array<{ at: number; direction: 'forward' | 'backward' | 'left' | 'right'; strength?: number }>;
  frames?: number[];
  views?: string[];
  cameras?: string[];
}

export interface SimContext {
  sim: Simulation;
  training: Training;
  rig: Rig;
  animations: RobotAnimation[];
  policies: PolicyRecord[];
  viewport: Viewport3DHandle | null;
  restoreCanvas: () => void;
  parts: ScenePart[];
  fixedCameras?: FixedCamera[];
}

const DIRS: Record<string, [number, number, number]> = {
  forward: [0, 0, 1],
  backward: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
};

const findByName = <T extends { name: string; id: string }>(list: T[], key: string) =>
  list.find((x) => x.id === key) ?? list.find((x) => x.name.toLowerCase() === key.toLowerCase());

function animationController(ctx: SimContext, name: string): Controller | string {
  const a = findByName(ctx.animations, name.trim());

  return a
    ? { kind: 'animation', animation: a }
    : `No animation "${name}". Animations: ${ctx.animations.map((x) => x.name).join(', ') || 'none'}.`;
}

async function policyController(ctx: SimContext, name: string): Promise<Controller | string> {
  const rec = findByName(ctx.policies, name.trim());

  if (!rec)
    return `No policy "${name}". Policies: ${ctx.policies.map((x) => x.name).join(', ') || 'none (train a skill with train_skill)'}.`;

  if (ctx.training.isStale(rec)) return `Policy ${rec.name} was trained on an older sim. Train it again.`;

  const spec = await ctx.training.loadPolicy(rec.id);

  return spec
    ? { kind: 'policy', policy: spec, robot: rec.robot }
    : `Policy ${rec.name} has no saved weights. Train it again.`;
}

async function controllerFor(ctx: SimContext, spec: string | undefined): Promise<Controller | string> {
  const s = (spec ?? 'hold').trim();

  if (s === 'hold' || s === 'limp') return { kind: s };

  if (s.startsWith('animation:')) return animationController(ctx, s.slice(10));

  if (s.startsWith('policy:')) return policyController(ctx, s.slice(7));

  return 'controller is "hold", "limp", "animation:<name>" or "policy:<name>".';
}

function robotLine(r: SimRun['stats']['robots'][number], model: SimRun['model'], seconds: number): string | null {
  const robot = model.robots.find((x) => x.key === r.key);

  if (!robot) return null;

  if (!robot.floating) return `${robot.name}: base welded to the floor (no leg joints).`;

  return `${robot.name}: ${r.fellAt !== null ? `FELL at ${runClock(r.fellAt)}` : `stayed up for ${duration(seconds)}`}; tilt ${Math.round(r.tilt)}°, height change ${Math.round(r.height * 1000)} mm, moved ${Math.round(r.travelled * 1000)} mm (${Math.round(r.forward * 1000)} mm forward).`;
}

function effortLine(j: SimRun['stats']['joints'][number], model: SimRun['model'], rig: Rig): string {
  const sj = model.joints.find((x) => x.id === j.id);
  const name = rig.byId.get(j.id)?.name ?? j.id;
  const unit = sj?.type === 'prismatic' ? 'N' : 'N·m';

  return `- ${j.id} (${prettyJointName(name)}): ${Math.round(Math.min(j.peak, 1) * 100)}% of ${sj ? sj.effort.toFixed(2) : '?'} ${unit} (${sj?.effortSource ?? '?'})${j.saturatedS > 0.02 ? `, ${duration(j.saturatedS)} at the limit` : ''}`;
}

export function simReport(run: SimRun, rig: Rig, seconds: number): string {
  const { stats, model } = run;
  const lines: string[] = [];
  const total = Object.values(model.massKg).reduce((s, v) => s + v, 0);
  const estimated = model.joints.filter((j) => j.effortSource === 'estimate');
  const guessed = model.joints.filter((j) => j.dynamics === 'estimated' && j.effortSource !== 'estimate');

  lines.push(
    `MuJoCo model: ${plural(model.joints.length, 'actuated joint')}, ${total.toFixed(2)} kg${estimated.length ? `; torque limits are estimated for ${plural(estimated.length, 'joint')} from weight (no servo assigned)` : ''}${guessed.length ? `; servo response is estimated for ${plural(guessed.length, 'joint')} (measured fits exist only for the STS3215 7.4 V and XL330)` : ''}.`,
  );

  for (const r of stats.robots) {
    const line = robotLine(r, model, seconds);

    if (line !== null) lines.push(line);
  }

  const worst = stats.joints.filter((j) => j.peak > 0.05).sort((a, b) => b.peak - a.peak);

  if (worst.length) {
    lines.push('Peak actuator effort (share of the joint’s torque limit):');

    for (const j of worst.slice(0, 10)) lines.push(effortLine(j, model, rig));
  }

  if (worst.some((j) => j.peak >= 0.99)) {
    lines.push(
      'A joint at its limit for long can’t hold its load: a stronger servo, two servos, a shorter lever or less weight beyond it.',
    );
  }

  return lines.join('\n');
}

export async function simulateRequest(ctx: SimContext, p: SimulatePayload): Promise<PoseReply> {
  if (!ctx.rig.joints.length)
    return { text: 'Nothing to simulate: the scene has no joints. Declare them with define_joints or import_robot.' };

  const seconds = Math.min(Math.max(p.seconds ?? 5, 0.5), 30);
  const controller = await controllerFor(ctx, p.controller);

  if (typeof controller === 'string') return { text: controller };

  let run: SimRun;

  try {
    const model = await ctx.sim.buildModel();
    const kg = Object.values(model.massKg).reduce((s, v) => s + v, 0) || 1;
    const pushes = (p.pushes ?? []).map((x) => {
      const d = DIRS[x.direction] ?? DIRS.forward;
      const n = kg * 9.81 * Math.min(Math.max(x.strength ?? 0.5, 0.05), 3);

      return { at: x.at, force: [d[0] * n, d[1] * n, d[2] * n] as [number, number, number] };
    });

    run = await ctx.sim.run({
      seconds,
      controller,
      pushes,
      frames: requestedFrames(p, seconds),
    });
  } catch (e) {
    return { text: `The simulation didn’t run: ${errorMessage(e)}` };
  }

  const text = simReport(run, ctx.rig, seconds);
  const seen = await cameraReply(ctx, run, p.cameras);
  const canvas = !p.cameras?.length || p.views?.length ? await viewportShots(ctx, run, p.views) : [];

  return { text: [text, seen.note].filter(Boolean).join('\n'), images: [...canvas, ...seen.shots] };
}

async function viewportShots(ctx: SimContext, run: SimRun, requested: string[] | undefined) {
  const vp = ctx.viewport;

  if (!run.frames.length || !vp) return [];

  const views = (requested?.length ? requested : ['iso']).slice(0, 2);
  const shots: Array<Promise<Array<{ view: string; dataUrl: string }>>> = [];

  for (const f of run.frames) {
    vp.setPose(f.deltas as Map<string, THREE.Matrix4>);
    shots.push(
      vp
        .captureViews(views, undefined, { maxSide: TOOL_IMAGE_SIDE })
        .then((taken) => taken.map((shot) => ({ view: `${shot.view} at ${runClock(f.t)}`, dataUrl: shot.dataUrl }))),
    );
  }

  ctx.restoreCanvas();

  return (await Promise.all(shots)).flat();
}

function requestedFrames(p: SimulatePayload, seconds: number): number[] | undefined {
  const frames = p.frames?.filter((t) => t >= 0 && t <= seconds).slice(0, 4);

  return frames?.length || !p.cameras?.length ? frames : [seconds];
}

async function cameraReply(ctx: SimContext, run: SimRun, names: string[] | undefined) {
  if (!names?.length) return { shots: [], note: '' };

  const seen = await cameraShots({
    parts: ctx.parts,
    world: ctx.sim.worldParts,
    model: run.model,
    fixed: ctx.fixedCameras ?? [],
    names: names.slice(0, 3),
    frames: run.frames.map((f) => ({ t: f.t, poses: f.poses })),
  });
  const note = seen.missing.length
    ? `No camera ${seen.missing.map((n) => `"${n}"`).join(', ')}. Cameras: ${seen.available.join(', ')}.`
    : '';

  return { shots: seen.shots, note };
}

function trainingLine(t: Training): string {
  if (t.status === 'error') return `Last training failed: ${t.error}`;

  if (t.status === 'done' && t.message) return t.message;

  return 'No training running.';
}

function runningLines(t: Training): string[] {
  const p = t.progress;
  const lines = [`Training: ${t.message ?? 'starting'}.`];

  if (p)
    lines.push(
      `${duration(p.elapsedS)} of ${duration(p.budgetS, 'min')}, ${(p.steps / 1e6).toFixed(1)}M steps (${Math.round(p.fps)}/s); reward ${p.reward.toFixed(2)}/s; episodes last ${duration(p.episodeS)} on average (falls end them early).`,
    );

  return lines;
}

function evalSummary(e: PolicyRecord['eval']): string {
  if (!e) return '';

  if (e.fellAt !== null) return `; fell at ${runClock(e.fellAt)} in a clean run`;

  return `; stayed up ${duration(e.seconds)} in a clean run, ${Math.round(e.forward * 1000)} mm forward`;
}

export function trainingStatusText(ctx: SimContext): string {
  const t = ctx.training;
  const running = t.status === 'setup' || t.status === 'running';
  const lines: string[] = running ? runningLines(t) : [trainingLine(t)];

  if (ctx.policies.length) {
    lines.push('Policies:');

    for (const r of ctx.policies) {
      const stale = t.isStale(r) ? '; trained on an older sim, train it again' : '';

      lines.push(
        `- ${r.name} (${r.task}${r.task === 'walk' ? ` at ${r.command[0]} m/s` : ''}, ${(r.trainedSteps / 1e6).toFixed(1)}M steps${evalSummary(r.eval)}${stale})`,
      );
    }
  }

  return lines.join('\n');
}
