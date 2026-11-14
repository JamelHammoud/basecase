import * as THREE from 'three';
import { cameraShots, type CameraShot } from '../cameras/cameraShots';
import type { FixedCamera } from '../cameras/fixed';
import { robotFacts } from '../cases/robotFit';
import { angle } from '../utils/angle';
import { isCameraPart } from '../routines/capabilities';
import { simDeltas } from '../sim/mjcfFrames';
import type { DriveCommand } from '../sim/driveTypes';
import { scanSummary } from '../sim/scanSummary';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import { toCad, toScene } from './agentFrame';
import { duration, runClock } from '../utils/duration';

export interface OperateAction {
  forward?: number;
  left?: number;
  turn?: number;
  lift?: number;
  target?: V3;
}

export interface OperatePayload {
  action?: OperateAction;
  seconds?: number;
  cameras?: string[];
  restart?: boolean;
}

export interface OperateContext {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  fixedCameras: FixedCamera[];
  wait?: (ms: number) => Promise<void>;
  shoot?: typeof cameraShots;
  calibrationErrors?: () => Promise<string>;
}

export interface OperateReply {
  text: string;
  images?: CameraShot[];
}

export const MAX_STEP_S = 5;

const MAX_CAMERAS = 3;
const IDLE: DriveCommand = { v: [0, 0, 0] };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const stepSeconds = (s: number | undefined) => Math.min(Math.max(s ?? 1, 0.1), MAX_STEP_S);

export function operateCommand(a: OperateAction = {}): DriveCommand {
  const clip = (v: number | undefined) => Math.min(Math.max(v ?? 0, -1), 1);

  return {
    v: [clip(a.forward), clip(a.left), clip(a.turn)],
    target: a.target ? toScene(a.target) : undefined,
    aux: [clip(a.lift), 0],
  };
}

export function defaultCameras(parts: ScenePart[], fixed: FixedCamera[]): string[] {
  const robot = parts.filter((p) => p.visible && isCameraPart(p)).map((p) => p.name);
  const stationary = fixed.length ? [fixed[0].name] : ['Scene'];

  return [...stationary, ...robot].slice(0, MAX_CAMERAS);
}

function lastPoses(sim: Simulation) {
  let latest: Float64Array | null = null;
  const stop = sim.subscribePoses((poses) => {
    latest = poses.slice();
  });

  return { take: () => latest, stop };
}

function stateLine(ctx: OperateContext, poses: Float64Array | null): string {
  const stats = ctx.sim.latestStats();
  const robot = stats?.robots[0];
  const lines: string[] = [];

  if (robot)
    lines.push(robot.fellAt !== null ? `Fell at ${runClock(robot.fellAt)}.` : `Upright, tilt ${angle(robot.tilt)}.`);

  const facts = robotFacts(ctx.rig, ctx.parts);
  const model = ctx.sim.model;
  const tip = facts.endEffector && model && poses && simDeltas(model, poses).get(facts.endEffector.part);

  if (tip) {
    const p = new THREE.Vector3(...facts.endEffector!.point).applyMatrix4(tip);

    lines.push(
      `End effector at [${toCad([p.x, p.y, p.z])
        .map((v) => v.toFixed(0))
        .join(', ')}] mm.`,
    );
  }

  lines.push(...scanSummary(model, ctx.sim.latestScan(), ctx.parts));

  return lines.join(' ');
}

async function ensureDriving(ctx: OperateContext, restart: boolean): Promise<string | null> {
  const { drive } = ctx.sim;

  if (restart && drive.active) drive.respawn();

  if (drive.active) return null;

  if (await drive.start()) return null;

  if (drive.status === 'teach')
    return 'Nothing drives this robot yet: train a skill that moves it (train_skill), then operate again.';

  return 'This robot has nothing to operate: give it wheels, legs or an arm with joints.';
}

export async function operateRequest(ctx: OperateContext, p: OperatePayload): Promise<OperateReply> {
  if (!ctx.rig.joints.length) return { text: 'Nothing to operate: the scene has no joints.' };

  const refused = await ensureDriving(ctx, Boolean(p.restart));

  if (refused) return { text: refused };

  const seconds = stepSeconds(p.seconds);
  const wait = ctx.wait ?? sleep;
  const watch = lastPoses(ctx.sim);

  ctx.sim.play();
  ctx.sim.drive.setKeys(operateCommand(p.action));
  await wait(seconds * 1000);
  ctx.sim.drive.setKeys(IDLE);
  ctx.sim.pause();

  const poses = watch.take();

  watch.stop();

  const names = (p.cameras?.length ? p.cameras : defaultCameras(ctx.parts, ctx.fixedCameras)).slice(0, MAX_CAMERAS);
  const seen = await (ctx.shoot ?? cameraShots)({
    parts: ctx.parts,
    world: ctx.sim.worldParts,
    model: ctx.sim.model,
    fixed: ctx.fixedCameras,
    names,
    frames: [{ t: 0, poses }],
  });
  const missing = seen.missing.length
    ? ` No camera ${seen.missing.join(', ')}; cameras: ${seen.available.join(', ')}.`
    : '';

  const calibration = (await ctx.calibrationErrors?.().catch(() => '')) ?? '';

  return {
    text: [`Ran ${duration(seconds)}.`, stateLine(ctx, poses), missing.trim(), calibration].filter(Boolean).join(' '),
    images: seen.shots,
  };
}
