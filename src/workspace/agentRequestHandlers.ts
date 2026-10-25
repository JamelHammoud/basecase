import type { PoseReply } from '../agent/agentPose';
import { describeMarks } from '../agent/agentMarks';
import { agentCatalog, partCode, snapshotScene, toCad, toScene, type AgentOp } from '../agent/agentScene';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { bomText, buildBom } from '../utils/bom';
import { engineeringText, type EngineeringReport } from '../utils/engineering';
import { downscaleDataUrl } from '../utils/imageFile';
import { platformBridge } from '../utils/platformBridge';
import { printReportOf, printReportText } from '../utils/printReport';
import { maskProfile, photoProfile } from '../utils/silhouette';
import {
  applyBuildSettings,
  declareJoints,
  type BuildSettingsPayload,
  type DefineJointsPayload,
} from './agentBuildRequests';
import { POSE_TOOL_KINDS, SIM_TOOL_KINDS } from './agentRobotTools';
import type { Vec3 } from './types';
import type { GeneratedGuide } from '../guide/generateGuide';

type Payload = Record<string, unknown>;

export interface RequestContext {
  parts: () => ScenePart[];
  project: () => ProjectSettings;
  viewport: () => Viewport3DHandle | null;
  setProjectNow: (next: ProjectSettings) => void;
  setAction: (action: string) => void;
  setCursor: (target: Vec3) => void;
  poseTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  simTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  verify: () => Promise<EngineeringReport>;
  applyOps: (ops: AgentOp[]) => Promise<string>;
  buildGuide: () => Promise<GeneratedGuide | null>;
}

type Handler = (payload: Payload, ctx: RequestContext, kind: string) => unknown;

const VIEW_IMAGE_SIDE = 1024;
const EVIDENCE_IMAGE_SIDE = 1568;

const idsOf = (payload: Payload) => (payload.ids as string[] | undefined) ?? undefined;

const toolReply = ({ text, images }: PoseReply) => ({ text, images });

function inspectLabel(ids: string[] | undefined, parts: ScenePart[]) {
  if (!ids?.length) return 'Looking';

  if (ids.length > 1) return `Inspecting ${ids.length} parts`;

  return `Inspecting ${parts.find((p) => p.id === ids[0])?.name ?? ids[0]}`;
}

function focus(payload: Payload, ctx: RequestContext) {
  const id = String(payload.id ?? '');
  const existing = ctx.parts().find((p) => p.id === id);

  if (existing) {
    ctx.setCursor([existing.position[0], existing.position[1] + existing.dimensions.height / 2, existing.position[2]]);
  } else if (Array.isArray(payload.position)) {
    ctx.setCursor(toScene(payload.position as Vec3));
  }

  ctx.setAction(String(payload.label ?? ''));

  return { ok: true };
}

async function screenshot(payload: Payload, ctx: RequestContext) {
  const views = (payload.views as string[] | undefined) ?? ['iso'];
  const ids = idsOf(payload);

  ctx.setAction(inspectLabel(ids, ctx.parts()));

  return { images: (await ctx.viewport()?.captureViews(views, ids, { maxSide: VIEW_IMAGE_SIDE })) ?? [] };
}

async function silhouetteCompare(payload: Payload, ctx: RequestContext) {
  const view = String(payload.view ?? 'front');
  const ref = await photoProfile(String(payload.reference));
  const [shot] = (await ctx.viewport()?.captureViews([view], idsOf(payload), { silhouette: true })) ?? [];
  const model = shot ? await maskProfile(shot.dataUrl) : null;

  return { reference: ref.profile, plain: ref.plain, reason: ref.reason, model };
}

const shapesOf = (ctx: RequestContext) => async (ids: string[]) => (await ctx.viewport()?.printShapes(ids)) ?? {};

async function bom(_payload: Payload, ctx: RequestContext) {
  const print = await printReportOf(ctx.parts(), ctx.project(), shapesOf(ctx));
  const supportG: Partial<Record<ProjectSettings['material'], number>> = {};

  for (const r of print.parts) supportG[r.material] = (supportG[r.material] ?? 0) + r.supportG;

  const built = buildBom({
    parts: ctx.parts(),
    project: ctx.project(),
    purchases: await platformBridge.listPurchases(),
    measures: (await ctx.viewport()?.measureParts()) ?? {},
    now: new Date(),
    supportG,
  });

  return { text: bomText(built, Object.fromEntries(ctx.parts().map((p) => [p.id, p.name]))) };
}

async function printability(payload: Payload, ctx: RequestContext) {
  const ids = payload.ids as string[] | undefined;
  const parts = ids?.length ? ctx.parts().filter((p) => ids.includes(p.id)) : ctx.parts();

  return { text: printReportText(await printReportOf(parts, ctx.project(), shapesOf(ctx))) };
}

function defineJoints(payload: Payload, ctx: RequestContext) {
  const { next, text } = declareJoints(payload as unknown as DefineJointsPayload, ctx.parts(), ctx.project(), (id) =>
    ctx.viewport()?.servoOutput(id),
  );

  ctx.setProjectNow(next);

  return { text };
}

async function buildGuide(_payload: Payload, ctx: RequestContext) {
  ctx.setAction('Making the build guide');

  const made = await ctx.buildGuide();

  if (!made) return { text: '' };

  const { plan, record } = made;
  const subs = plan.modules.filter((m) => m.parent).map((m) => (m.copies > 1 ? `${m.name} ×${m.copies}` : m.name));
  const where = made.saved ? 'Saved' : 'Opened (no PDF outside the desktop app)';

  return {
    text:
      `${where}: ${record.pages} pages, ${record.steps} steps, ${plan.items.length} kinds of parts, ${plan.tools.length} tools.` +
      (subs.length ? ` Sub-assemblies: ${subs.join(', ')}.` : '') +
      ' Tell the user and link it as [build guide](#build-guide).',
  };
}

function setBuild(payload: Payload, ctx: RequestContext) {
  const { next, bad } = applyBuildSettings(ctx.project(), payload as BuildSettingsPayload);

  ctx.setProjectNow(next);

  return { ok: true, unknown: bad, extras: next.extras ?? [] };
}

const HANDLERS: Record<string, Handler> = {
  snapshot: (_payload, ctx) => {
    const marks = describeMarks(ctx.project().marks, ctx.parts());

    return { ...snapshotScene(ctx.parts()), ...(marks.length ? { marks } : {}) };
  },
  focus,
  part_code: (payload, ctx) => partCode(ctx.parts(), String(payload.id)),
  screenshot,
  interference: async (payload, ctx) => {
    const found = (await ctx.viewport()?.interference(idsOf(payload))) ?? { interferences: [], coplanar: [] };

    return { items: found.interferences, coplanar: found.coplanar };
  },
  silhouette_compare: silhouetteCompare,
  bom,
  printability,
  define_joints: defineJoints,
  verify: async (_payload, ctx) => {
    ctx.setAction('Checking the design');

    return { text: engineeringText(await ctx.verify(), toCad) };
  },
  set_build: setBuild,
  build_guide: buildGuide,
  catalog: (payload) => ({ text: agentCatalog(String(payload.query ?? '')) }),
  downscale_image: async (payload) => ({
    dataUrl: await downscaleDataUrl(String(payload.dataUrl), Number(payload.maxSide) || EVIDENCE_IMAGE_SIDE, 0.88),
  }),
  apply: async (payload, ctx) => ({ summary: await ctx.applyOps((payload.ops as AgentOp[]) ?? []) }),
  ...Object.fromEntries(
    POSE_TOOL_KINDS.map((kind): [string, Handler] => [
      kind,
      async (payload, ctx) => toolReply(await ctx.poseTool(kind, payload)),
    ]),
  ),
  ...Object.fromEntries(
    SIM_TOOL_KINDS.map((kind): [string, Handler] => [
      kind,
      async (payload, ctx) => toolReply(await ctx.simTool(kind, payload)),
    ]),
  ),
};

export const requestHandler = (kind: string): Handler | null => (Object.hasOwn(HANDLERS, kind) ? HANDLERS[kind] : null);
