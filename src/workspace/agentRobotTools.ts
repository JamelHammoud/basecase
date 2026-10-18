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
import {
  simulateRequest,
  trainingStatusText,
  trainRequest,
  type SimContext,
  type SimulatePayload,
} from '../agent/agentSim';
import type { ProjectSettings, RobotPoseState } from '../types/robotics';
import { ROBOT_PRESETS } from '../utils/robotImport';
import { newId } from './helpers';
import { robotHeightMm } from './robotPlacement';
import type { ImportRobotResult, RobotSource } from './useRobotInsert';

type Payload = Record<string, unknown>;

export interface PoseToolContext extends PoseContext {
  setAction: (action: string) => void;
  importRobot: (source: RobotSource) => Promise<ImportRobotResult>;
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
  const pl = payload as { url?: string; preset?: string; name?: string };
  const preset = pl.preset ? ROBOT_PRESETS.find((r) => r.id === pl.preset) : undefined;
  const url = preset?.url ?? pl.url;

  if (!url) return { text: `Give a URL or one of the presets: ${ROBOT_PRESETS.map((r) => r.id).join(', ')}` };

  ctx.setAction(`Importing ${preset?.title ?? 'robot'}`);

  return { text: importedText(await ctx.importRobot({ kind: 'url', url, name: pl.name ?? preset?.title })) };
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
};

export const POSE_TOOL_KINDS = ['get_rig', 'pose', 'animate', 'retarget', 'import_robot'];

export async function runPoseTool(kind: string, payload: Payload, ctx: PoseToolContext): Promise<PoseReply> {
  const tool = Object.hasOwn(POSE_TOOLS, kind) ? POSE_TOOLS[kind] : importRobotTool;

  return tool(ctx, payload);
}

export interface SimToolContext extends SimContext {
  setAction: (action: string) => void;
}

export const SIM_TOOL_KINDS = ['simulate', 'train', 'training_status'];

export async function runSimTool(kind: string, payload: Payload, ctx: SimToolContext): Promise<PoseReply> {
  if (kind === 'simulate') {
    ctx.setAction('Simulating');

    return simulateRequest(ctx, payload as SimulatePayload);
  }

  if (kind === 'train') {
    ctx.setAction('Starting training');

    return trainRequest(ctx, payload as { task?: 'stand' | 'walk'; minutes?: number; speed_mps?: number });
  }

  return { text: trainingStatusText(ctx) };
}
