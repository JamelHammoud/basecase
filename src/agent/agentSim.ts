import type * as THREE from 'three';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Controller } from '../sim/engine';
import type { SimRun, Simulation } from '../sim/useSimulation';
import type { Training } from '../sim/useTraining';
import type { PolicyRecord, RobotAnimation } from '../types/robotics';
import { prettyJointName, type Rig } from '../utils/kinematics';
import type { PoseReply } from './agentPose';
import { TOOL_IMAGE_SIDE } from './agentPoseShared';

export interface SimulatePayload {
  seconds?: number;
  controller?: string;
  pushes?: Array<{ at: number; direction: 'forward' | 'backward' | 'left' | 'right'; strength?: number }>;
  frames?: number[];
  views?: string[];
}

export interface SimContext {
  sim: Simulation;
  training: Training;
  rig: Rig;
  animations: RobotAnimation[];
  policies: PolicyRecord[];
  viewport: Viewport3DHandle | null;
  restoreCanvas: () => void;
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
    return `No policy "${name}". Policies: ${ctx.policies.map((x) => x.name).join(', ') || 'none (train one with train_policy)'}.`;

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

  return `${robot.name}: ${r.fellAt !== null ? `FELL at ${r.fellAt.toFixed(2)} s` : `stayed up for ${seconds} s`}; tilt ${Math.round(r.tilt)}°, height change ${Math.round(r.height * 1000)} mm, moved ${Math.round(r.travelled * 1000)} mm (${Math.round(r.forward * 1000)} mm forward).`;
}

function effortLine(j: SimRun['stats']['joints'][number], model: SimRun['model'], rig: Rig): string {
  const sj = model.joints.find((x) => x.id === j.id);
  const name = rig.byId.get(j.id)?.name ?? j.id;
  const unit = sj?.type === 'prismatic' ? 'N' : 'N·m';

  return `- ${j.id} (${prettyJointName(name)}): ${Math.round(Math.min(j.peak, 1) * 100)}% of ${sj ? sj.effort.toFixed(2) : '?'} ${unit} (${sj?.effortSource ?? '?'})${j.saturatedS > 0.02 ? `, ${j.saturatedS.toFixed(2)} s at the limit` : ''}`;
}

export function simReport(run: SimRun, rig: Rig, seconds: number): string {
  const { stats, model } = run;
  const lines: string[] = [];
  const total = Object.values(model.massKg).reduce((s, v) => s + v, 0);
  const estimated = model.joints.filter((j) => j.effortSource === 'estimate');

  lines.push(
    `MuJoCo model: ${model.joints.length} actuated joints, ${total.toFixed(2)} kg${estimated.length ? `; torque limits for ${estimated.length} joints are estimated from weight (no servo assigned)` : ''}.`,
  );

  for (const r of stats.robots) {
    const line = robotLine(r, model, seconds);

    if (line !== null) lines.push(line);
  }

  const worst = stats.joints.filter((j) => j.peak > 0.05).sort((a, b) => b.peak - a.peak);

  if (worst.length) {
    lines.push("Peak actuator effort (share of the joint's torque limit):");

    for (const j of worst.slice(0, 10)) lines.push(effortLine(j, model, rig));
  }

  lines.push(
    "A joint at its limit for long can't hold its load: a stronger servo, two servos, a shorter lever or less weight beyond it.",
  );

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
      frames: p.frames?.filter((t) => t >= 0 && t <= seconds).slice(0, 4),
    });
  } catch (e) {
    return { text: `The simulation didn't run: ${e instanceof Error ? e.message : String(e)}` };
  }

  const text = simReport(run, ctx.rig, seconds);
  const shots: Array<Promise<Array<{ view: string; dataUrl: string }>>> = [];

  if (run.frames.length && ctx.viewport) {
    const vp = ctx.viewport;
    const views = (p.views?.length ? p.views : ['iso']).slice(0, 2);

    for (const f of run.frames) {
      vp.setPose(f.deltas as Map<string, THREE.Matrix4>);
      shots.push(
        vp
          .captureViews(views, undefined, { maxSide: TOOL_IMAGE_SIDE })
          .then((taken) =>
            taken.map((shot) => ({ view: `${shot.view} at ${f.t.toFixed(1)} s`, dataUrl: shot.dataUrl })),
          ),
      );
    }

    ctx.restoreCanvas();
  }

  return { text, images: (await Promise.all(shots)).flat() };
}

export async function trainRequest(
  ctx: SimContext,
  p: { task?: 'stand' | 'walk'; minutes?: number; speed_mps?: number },
): Promise<PoseReply> {
  const task = p.task === 'walk' ? 'walk' : 'stand';
  const minutes = Math.min(Math.max(Math.round(p.minutes ?? 10), 1), 60);

  if (!ctx.training.canTrain)
    return { text: ctx.training.blocker ?? 'Training is already running. Check training_status.' };

  const err = await ctx.training.start({
    task,
    minutes,
    command: task === 'walk' ? [Math.min(Math.max(p.speed_mps ?? 0.3, 0.05), 2), 0, 0] : [0, 0, 0],
  });

  if (err) return { text: `Training didn't start: ${err}` };

  return {
    text: `Training ${task === 'walk' ? 'walking' : 'standing'} for ${minutes} min on 64 randomized copies of the robot (friction, masses, servo strength, shoves). Check progress with training_status; when it's done, test the policy with simulate controller "policy:<name>".`,
  };
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
      `${Math.round(p.elapsedS / 60)} of ${Math.round(p.budgetS / 60)} min, ${(p.steps / 1e6).toFixed(1)}M steps (${Math.round(p.fps)}/s); reward ${p.reward.toFixed(2)}/s; episodes last ${p.episodeS.toFixed(1)} s on average (falls end them early).`,
    );

  return lines;
}

function evalSummary(e: PolicyRecord['eval']): string {
  if (!e) return '';

  if (e.fellAt !== null) return `; fell at ${e.fellAt.toFixed(1)} s in a clean run`;

  return `; stayed up ${e.seconds} s in a clean run, ${Math.round(e.forward * 1000)} mm forward`;
}

export function trainingStatusText(ctx: SimContext): string {
  const t = ctx.training;
  const running = t.status === 'setup' || t.status === 'running';
  const lines: string[] = running ? runningLines(t) : [trainingLine(t)];

  if (ctx.policies.length) {
    lines.push('Policies:');

    for (const r of ctx.policies) {
      lines.push(
        `- ${r.name} (${r.task}${r.task === 'walk' ? ` at ${r.command[0]} m/s` : ''}, ${(r.trainedSteps / 1e6).toFixed(1)}M steps${evalSummary(r.eval)})`,
      );
    }
  }

  return lines.join('\n');
}
