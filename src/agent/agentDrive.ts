import * as THREE from 'three';
import { robotFacts } from '../cases/robotFit';
import { readWorldObjects, worldItem, type WorldObject } from '../cases/schema';
import { kitEntries } from '../skills/motorKit';
import {
  driveAccess,
  FALL_CHECK_SECONDS,
  FALL_CHECK_SETTLE_SECONDS,
  fallCheckCommands,
  fallCheckPassed,
  policyCommand,
  type DriveAccess,
  type VelocityDrive,
} from '../sim/driveAccess';
import type { DriveSetup } from '../sim/drive';
import type { DriveCommand } from '../sim/driveTypes';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import { toCad, toScene } from './agentFrame';
import { plural } from '../../electron/plural.mjs';
import { duration, runClock } from '../utils/duration';

export interface DriveToolContext {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  velocity?: () => Promise<VelocityDrive | null>;
}

export interface AgentObject {
  id?: string;
  name: string;
  kind: WorldObject['kind'];
  position: V3;
  size: V3;
  behavior: WorldObject['behavior'];
  mass_g?: number;
  friction?: number;
  color?: string;
}

interface AgentCommand {
  at: number;
  forward?: number;
  left?: number;
  turn?: number;
  lift?: number;
  target?: V3;
  grip?: number;
}

const slug = (name: string, i: number) =>
  name
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || `object-${i}`;

export function sceneObjects(objects: AgentObject[]): WorldObject[] {
  const raw = objects.map((o, i) => ({
    id: o.id ?? `${slug(o.name, i)}-${i}`,
    name: o.name,
    kind: o.kind,
    position: toScene(o.position),
    rotation: [0, 0, 0],
    size: [o.size[0], o.size[2], o.size[1]],
    color: o.color ?? (o.behavior === 'marker' ? '#0d99ff' : '#8a8a8a'),
    ...(o.behavior === 'marker' ? { opacity: 0.45 } : {}),
    behavior: o.behavior,
    ...(o.mass_g !== undefined ? { massG: o.mass_g } : {}),
    ...(o.friction !== undefined ? { friction: o.friction } : {}),
  }));

  return readWorldObjects(raw);
}

export function setWorldRequest(ctx: DriveToolContext, payload: { objects?: AgentObject[] }): { text: string } {
  const objects = sceneObjects(payload.objects ?? []);

  ctx.sim.setWorld(objects.map(worldItem));

  if (!objects.length) return { text: 'Cleared the world.' };

  return {
    text: `The world holds ${plural(objects.length, 'object')}: ${objects.map((o) => `${o.name} (${o.behavior})`).join(', ')}.`,
  };
}

const toCommand = (c: AgentCommand): DriveCommand => ({
  v: [c.forward ?? 0, c.left ?? 0, c.turn ?? 0],
  target: c.target ? toScene(c.target) : undefined,
  aux: [c.lift ?? 0, c.grip ?? 0],
});

function liveDrive(ctx: DriveToolContext, commands: AgentCommand[]) {
  void ctx.sim.drive.start().then((on) => {
    if (!on) return;

    for (const c of commands) setTimeout(() => ctx.sim.drive.setKeys(toCommand(c)), c.at * 1000);
  });

  return {
    text: `Driving on the canvas: ${commands.length} commands over ${duration(Math.max(...commands.map((c) => c.at)))}.`,
  };
}

async function staysUp(ctx: DriveToolContext, model: SimModel, setup: DriveSetup): Promise<boolean> {
  const check = await ctx.sim.runOn(model, {
    seconds: FALL_CHECK_SECONDS + FALL_CHECK_SETTLE_SECONDS,
    controller: { kind: 'drive', setup },
    commands: fallCheckCommands(),
  });
  const lift = model.initial.roots?.[model.robots[0].key]?.position?.[1] ?? 0;

  return fallCheckPassed(check.stats, (model.bodies[0].origin[1] + lift) / 1000);
}

export function teachText(model: SimModel): string {
  if (kitEntries(model).length)
    return 'Train a walking skill first: train_skill kit "walk" (the Motor Kit’s velocity tracking), then call start_drive again: it drives through that skill.';

  return 'Train a skill that moves it first: draft_skill (a velocity goal) and train_skill, then call start_drive again: it drives through that skill.';
}

const NOTHING_MOVES =
  'Nothing on this robot moves it around or reaches: give it wheels, legs or an arm with joints, then call start_drive again.';

const FELL_TEXT =
  'It falls on its scripted walk. Train a walking skill with train_skill kit "walk", then call start_drive again: it drives through that skill.';

type Ready = Extract<DriveAccess, { kind: 'ready' | 'policy' }>;

function controllerOf(access: Ready) {
  if (access.kind === 'ready') return { kind: 'drive' as const, setup: access.setup };

  return { kind: 'policy' as const, policy: access.velocity.policy, robot: access.robot };
}

function commandOf(access: Ready, c: AgentCommand): DriveCommand {
  const command = toCommand(c);

  return access.kind === 'policy' ? policyCommand(command, access.velocity.topSpeed) : command;
}

export async function startDriveRequest(
  ctx: DriveToolContext,
  payload: { seconds?: number; commands?: AgentCommand[]; live?: boolean },
): Promise<{ text: string }> {
  const commands = [...(payload.commands ?? [])].sort((a, b) => a.at - b.at);
  const seconds = Math.min(Math.max(payload.seconds ?? 6, 0.5), 30);

  if (!ctx.rig.joints.length) return { text: NOTHING_MOVES };

  if (payload.live) return liveDrive(ctx, commands);

  const model = await ctx.sim.buildModel();
  const velocity = (await ctx.velocity?.()) ?? null;
  const access = driveAccess({ rig: ctx.rig, parts: ctx.parts, model, velocity });

  if (access.kind === 'teach') return { text: teachText(model) };

  if (access.kind === 'none') return { text: NOTHING_MOVES };

  if (access.kind === 'ready' && access.needsFallCheck && !(await staysUp(ctx, model, access.setup)))
    return { text: FELL_TEXT };

  const run = await ctx.sim.runOn(model, {
    seconds,
    controller: controllerOf(access),
    commands: commands.map((c) => ({ at: c.at, command: commandOf(access, c) })),
    frames: [0, seconds],
  });

  return { text: driveReport({ ctx, run, cls: access.cls, seconds }) };
}

interface ReportInput {
  ctx: DriveToolContext;
  run: Awaited<ReturnType<Simulation['runOn']>>;
  cls: string;
  seconds: number;
}

function driveReport({ ctx, run, cls, seconds }: ReportInput): string {
  const r = run.stats.robots[0];
  const lines = [
    `Drove ${duration(seconds)} as ${cls === 'legs' ? 'a walker' : `a${cls === 'arm' ? 'n' : ''} ${cls}`}.`,
  ];

  if (r && cls !== 'arm') {
    lines.push(
      `Moved ${(r.travelled * 1000).toFixed(0)} mm, ${(r.forward * 1000).toFixed(0)} mm of it forward; tilt ${r.tilt.toFixed(0)}°.`,
    );
    lines.push(r.fellAt === null ? 'Stayed up.' : `Fell at ${runClock(r.fellAt)}.`);
  }

  const facts = robotFacts(ctx.rig, ctx.parts);
  const last = run.frames[run.frames.length - 1];
  const tip = facts.endEffector && last?.deltas.get(facts.endEffector.part);

  if (cls === 'arm' && tip) {
    const p = new THREE.Vector3(...facts.endEffector!.point).applyMatrix4(tip);

    lines.push(
      `End effector ended at [${toCad([p.x, p.y, p.z])
        .map((v) => v.toFixed(0))
        .join(', ')}] mm.`,
    );
  }

  return lines.join(' ');
}
