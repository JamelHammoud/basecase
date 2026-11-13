import { operateRequest, type OperatePayload } from '../agent/agentOperate';
import {
  animateRequest,
  getRig,
  retargetRequest,
  setPoseRequest,
  type AnimatePayload,
  type PoseContext,
  type PosePayload,
  type PoseReply,
  type RetargetPayload,
} from '../agent/agentPose';
import { simulateRequest, trainingStatusText, type SimContext, type SimulatePayload } from '../agent/agentSim';
import type { ProjectSettings, RobotPoseState } from '../types/robotics';
import { setWorldRequest, startDriveRequest, type DriveToolContext } from '../agent/agentDrive';
import { ROBOT_PRESETS } from '../utils/robotImport';
import { findObjects, insertObject } from './agentSimReadyTools';
import { newId } from './helpers';
import { robotHeightMm } from './robotPlacement';
import type { ImportRobotResult, RobotSource } from './useRobotInsert';
import type { Leader } from '../leader/makeLeader';
import { scopeOf } from '../agent/agentPoseShared';

type Payload = Record<string, unknown>;

export interface PoseToolContext extends PoseContext {
  setAction: (action: string) => void;
  makeLeader: (robot?: string) => Leader | null;
  importRobot: (
    source: RobotSource,
    at?: [number, number, number],
    opts?: { ask?: boolean },
  ) => Promise<ImportRobotResult>;
}

export function withSavedPose(project: ProjectSettings, name: string, state: RobotPoseState): ProjectSettings {
  const robot = (state as { robot?: string }).robot;
  const list = (project.poses ?? []).filter((p) => !(p.name === name && p.robot === robot));

  return {
    ...project,
    poses: [...list, { id: newId('pose'), name, values: { ...state.values }, root: state.root, robot }],
  };
}

function importedText(got: ImportRobotResult) {
  if (typeof got === 'string') return got;

  return (
    `Inserted ${got.name}: ${got.parts.length} parts (group "${got.name}"), ${got.joints.length} joints, ${robotHeightMm(got.parts)} mm tall.` +
    (got.notes.length ? `\nMissing files: ${got.notes.slice(0, 8).join('; ')}` : '') +
    `\nCall get_rig for the joints.`
  );
}

async function importRobotTool(ctx: PoseToolContext, payload: Payload): Promise<PoseReply> {
  const pl = payload as { url?: string; preset?: string; name?: string; entry?: string };
  const preset = pl.preset ? ROBOT_PRESETS.find((r) => r.id === pl.preset) : undefined;
  const url = preset?.url ?? pl.url;

  if (!url) return { text: `Give a URL or one of the presets: ${ROBOT_PRESETS.map((r) => r.id).join(', ')}` };

  ctx.setAction(`Importing ${preset?.title ?? 'robot'}`);

  const source = { kind: 'url' as const, url, name: pl.name ?? preset?.title, entry: pl.entry };

  return { text: importedText(await ctx.importRobot(source, undefined, { ask: false })) };
}

function leaderText(leader: Leader) {
  const printed = leader.parts.filter((p) => p.cad).map((p) => p.name);

  return (
    `Opened "${leader.name}" in a new scene tab: ${leader.joints.length} joints in the follower's order (${leader.joints.map((j) => j.id).join(', ')}), ` +
    `one Dynamixel XL330-M288 per joint, and ${printed.length} printed parts (${printed.join(', ')}). Its scene records this scene and the joints it leads.`
  );
}

function makeLeaderTool(ctx: PoseToolContext, payload: Payload): PoseReply {
  const wanted = typeof payload.robot === 'string' ? payload.robot : undefined;
  const scope = wanted ? scopeOf(ctx, wanted) : null;

  if (typeof scope === 'string') return { text: scope };

  ctx.setAction('Making a leader');

  const leader = ctx.makeLeader(scope?.key);

  return {
    text: leader ? leaderText(leader) : 'No fixed-base arm whose movable joints form one chain.',
  };
}

const POSE_TOOLS: Record<string, (ctx: PoseToolContext, payload: Payload) => PoseReply | Promise<PoseReply>> = {
  get_rig: (ctx, payload) => getRig(ctx, typeof payload.robot === 'string' ? payload.robot : undefined),
  pose: (ctx, payload) => {
    ctx.setAction('Posing');

    return setPoseRequest(ctx, payload as PosePayload);
  },
  animate: (ctx, payload) => {
    ctx.setAction(`Animating ${String(payload.name ?? '')}`);

    return animateRequest(ctx, payload as unknown as AnimatePayload);
  },
  retarget: (ctx, payload) => {
    ctx.setAction('Retargeting motion');

    return retargetRequest(ctx, payload as RetargetPayload);
  },
  make_leader: makeLeaderTool,
  find_objects: findObjects,
  insert_object: insertObject,
};

export const POSE_TOOL_KINDS = [
  'get_rig',
  'pose',
  'animate',
  'retarget',
  'import_robot',
  'make_leader',
  'find_objects',
  'insert_object',
];

export async function runPoseTool(kind: string, payload: Payload, ctx: PoseToolContext): Promise<PoseReply> {
  const tool = Object.hasOwn(POSE_TOOLS, kind) ? POSE_TOOLS[kind] : importRobotTool;

  return tool(ctx, payload);
}

export interface SimToolContext extends SimContext, DriveToolContext {
  setAction: (action: string) => void;
  calibrationErrors?: () => Promise<string>;
}

export const SIM_TOOL_KINDS = ['simulate', 'training_status', 'set_world', 'start_drive', 'operate'];

export async function runSimTool(kind: string, payload: Payload, ctx: SimToolContext): Promise<PoseReply> {
  if (kind === 'set_world') return setWorldRequest(ctx, payload);

  if (kind === 'start_drive') {
    ctx.setAction('Driving');

    return startDriveRequest(ctx, payload);
  }

  if (kind === 'operate') {
    ctx.setAction('Operating');

    return operateRequest({ ...ctx, fixedCameras: ctx.fixedCameras ?? [] }, payload as OperatePayload);
  }

  if (kind === 'simulate') {
    ctx.setAction('Simulating');

    return simulateRequest(ctx, payload as SimulatePayload);
  }

  if (kind === 'training_status') return { text: trainingStatusText(ctx) };

  throw new Error(`Unknown simulation tool "${kind}"`);
}
