import type { PoseReply } from '../agent/agentPose';
import { describeMarks } from '../agent/agentMarks';
import { partCode, partRecord, partSource } from '../agent/agentPartRecord';
import { snapshotScene, toCad, toScene, type AgentOp } from '../agent/agentScene';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { PrinterSetup } from '../data/printers';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { bomText, buildBom } from '../utils/bom';
import { engineeringText, type EngineeringReport } from '../utils/engineering';
import { downscaleDataUrl } from '../utils/imageFile';
import { platformBridge } from '../utils/platformBridge';
import type { SliceRecord } from '../print/printBridge';
import { sliceText } from '../print/sliceText';
import { assemblyCheck, sceneFits } from './agentAssemblyRequests';
import { addSourced, disputeFinding, importCad, readinessRequest } from './agentSourcingRequests';
import type { ReadinessHandle } from './useReadiness';
import { printReportOf, printReportText, type PrintReport } from '../utils/printReport';
import type { VisionMasks } from '../utils/photoMask';
import { maskProfile, referenceProfile } from '../utils/silhouette';
import { bandMismatch, type Profile } from '../utils/silhouetteProfile';
import {
  applyBuildSettings,
  declareJoints,
  type BuildSettingsPayload,
  type DefineJointsPayload,
} from './agentBuildRequests';
import { craftScene, partMeshes, visibleShare } from './agentCraftRequests';
import { findJointAxes } from './agentJointAxes';
import { PORT_HANDLERS } from './agentPortRequests';
import { PLAN_HANDLERS, prepareOps } from './agentPlanRequests';
import { costByClass } from '../utils/budget';
import { budgetPlanNote, catalogRequest, costNotes, sizeActuatorsRequest } from './agentCostRequests';
import { POSE_TOOL_KINDS, SIM_TOOL_KINDS } from './agentRobotTools';
import type { SweepPayload } from './agentSweepRequest';
import type { Vec3 } from './types';
import type { GeneratedGuide } from '../guide/generateGuide';
import { fitView } from './agentFitView';
import { labelledScreenshot } from './agentLabelRequest';
import { targetCompare } from './agentTargetRequest';
import { scaleRequest, traceRequest } from './agentTraceRequest';
import { CASE_CODE_HANDLERS } from './agentCaseCodeRequests';
import { CASE_HANDLERS } from './agentCaseRequests';
import type { CaseCompare } from './useCaseCompare';
import type { CaseExplore } from './useCaseExplore';
import type { CaseRun } from './useCaseRun';
import { ROUTINE_HANDLERS } from './agentRoutineRequests';
import { SKILL_HANDLERS } from './agentSkillRequests';
import type { Cases } from './useCases';
import type { Routines } from './useRoutines';
import type { SceneSkills } from './useSkills';
import { synthesizeLinkageRequest, type LinkagePayload } from '../linkage/agentLinkage';
import { synthesizeInWorker } from '../linkage/linkageClient';
import { newId } from './helpers';
import { plural } from '../../electron/plural.mjs';

type Payload = Record<string, unknown>;

export interface RequestContext {
  parts: () => ScenePart[];
  project: () => ProjectSettings;
  printer: () => PrinterSetup;
  slice: (report: PrintReport) => Promise<SliceRecord>;
  viewport: () => Viewport3DHandle | null;
  setProjectNow: (next: ProjectSettings) => void;
  commitCases: (update: (cases: ProjectSettings['cases']) => ProjectSettings['cases']) => void;
  insertParts: (parts: ScenePart[], joints: RobotJoint[]) => void;
  setAction: (action: string) => void;
  setCursor: (target: Vec3) => void;
  poseTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  simTool: (kind: string, payload: Payload) => Promise<PoseReply>;
  verify: (opts?: { peak?: boolean }) => Promise<EngineeringReport>;
  readiness: ReadinessHandle;
  sweep: (payload: SweepPayload) => Promise<{ text: string }>;
  applyOps: (ops: AgentOp[]) => Promise<string>;
  edits?: (owner: string) => string[] | null;
  buildGuide: () => Promise<GeneratedGuide | null>;
  routines: Routines;
  cases: Cases;
  caseCompare: CaseCompare;
  caseExplore: CaseExplore;
  caseRun: CaseRun;
  skills: SceneSkills;
  mergeParts: (ids: string[]) => Promise<string | null>;
}

type Handler = (payload: Payload, ctx: RequestContext, kind: string) => unknown;

const VIEW_IMAGE_SIDE = 1024;
const EVIDENCE_IMAGE_SIDE = 1568;
const MAX_IMAGE_SIDE = 2576;

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

  const maxSide = Math.min(MAX_IMAGE_SIDE, Number(payload.maxSide) || VIEW_IMAGE_SIDE);

  if (payload.labels) return labelledScreenshot({ views, ids, maxSide, grid: Boolean(payload.grid) }, ctx);

  return { images: (await ctx.viewport()?.captureViews(views, ids, { maxSide, grid: Boolean(payload.grid) })) ?? [] };
}

async function modelProfiles(views: string[], ids: string[] | undefined, ctx: RequestContext) {
  const shots = (await ctx.viewport()?.captureViews(views, ids, { silhouette: true })) ?? [];
  const out: Record<string, Profile> = {};

  for (const shot of shots) {
    const profile = await maskProfile(shot.dataUrl);

    if (profile) out[shot.view] = profile;
  }

  return out;
}

function bestView(reference: Profile | null, models: Record<string, Profile>) {
  const views = Object.keys(models);

  if (!reference || views.length < 2) return views[0];

  return views.reduce((best, v) =>
    bandMismatch(reference, models[v]) < bandMismatch(reference, models[best]) ? v : best,
  );
}

async function silhouetteCompare(payload: Payload, ctx: RequestContext) {
  const views = (payload.views as string[] | undefined) ?? [String(payload.view ?? 'front')];
  const ids = idsOf(payload);
  const models = await modelProfiles(views, ids, ctx);
  const ref = await referenceProfile({
    dataUrl: String(payload.reference),
    masks: (payload.masks as VisionMasks | undefined) ?? null,
    modelAspect: Math.max(0, ...Object.values(models).map((m) => m.aspect)),
    allowCut: Boolean(ids?.length),
  });
  const view = bestView(ref.profile, models);

  return {
    reference: ref.profile,
    plain: ref.plain,
    reason: ref.reason,
    source: ref.source,
    notes: ref.notes,
    view,
    model: view ? models[view] : null,
    mismatch: view && ref.profile ? bandMismatch(ref.profile, models[view]) : null,
  };
}

const shapesOf = (ctx: RequestContext) => async (ids: string[], faces?: Record<string, Vec3[]>) =>
  (await ctx.viewport()?.printShapes(ids, faces)) ?? {};

const printCtx = (ctx: RequestContext) => ({ project: ctx.project(), printer: ctx.printer() });

async function bom(_payload: Payload, ctx: RequestContext) {
  const print = await printReportOf(ctx.parts(), printCtx(ctx), shapesOf(ctx));
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

  return {
    text: bomText(built, Object.fromEntries(ctx.parts().map((p) => [p.id, p.name]))),
    data: {
      estimatedUsd: built.totals.estimatedUsd,
      budgetUsd: built.totals.budgetUsd ?? null,
      actuatorsUsd: costByClass(built).actuators,
    },
  };
}

async function printability(payload: Payload, ctx: RequestContext) {
  const ids = payload.ids as string[] | undefined;
  const parts = ids?.length ? ctx.parts().filter((p) => ids.includes(p.id)) : ctx.parts();

  return { text: printReportText(await printReportOf(parts, printCtx(ctx), shapesOf(ctx))) };
}

async function slicePlates(_payload: Payload, ctx: RequestContext) {
  ctx.setAction('Slicing the plates');

  const report = await printReportOf(ctx.parts(), printCtx(ctx), shapesOf(ctx));

  return { text: sliceText(report, await ctx.slice(report)) };
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
      `${where}: ${plural(record.pages, 'page')}, ${plural(record.steps, 'step')}, ${plural(plan.items.length, 'kind of part', 'kinds of parts')}, ${plural(plan.tools.length, 'tool')}.` +
      (subs.length ? ` Sub-assemblies: ${subs.join(', ')}.` : '') +
      ' Tell the user and link it as [build guide](#build-guide).',
  };
}

async function setBuild(payload: Payload, ctx: RequestContext) {
  const { next, bad } = applyBuildSettings(ctx.project(), payload as BuildSettingsPayload);

  ctx.setProjectNow(next);

  return { ok: true, unknown: bad, extras: next.extras ?? [], tether: next.tether, plan: await budgetPlanNote(ctx) };
}

async function applyWithCost(payload: Payload, ctx: RequestContext) {
  const { ops, problems } = prepareOps((payload.ops as AgentOp[]) ?? [], ctx);
  const summary = await ctx.applyOps(ops);
  const framed = problems.length ? ` Not placed: ${problems.join('; ')}.` : '';

  return { summary: summary + framed + (await costNotes(ops, ctx)) };
}

const HANDLERS: Record<string, Handler> = {
  snapshot: async (_payload, ctx) => {
    const marks = describeMarks(ctx.project().marks, ctx.parts());
    const measured = await ctx.viewport()?.measureParts();

    return { ...snapshotScene(ctx.parts(), measured), ...(marks.length ? { marks } : {}) };
  },
  focus,
  part_code: (payload, ctx) => partCode(ctx.parts(), String(payload.id)),
  part_record: (payload, ctx) => partRecord(ctx.parts(), String(payload.id)),
  part_source: (payload, ctx) => partSource(ctx.parts(), String(payload.id)),
  part_meshes: (payload, ctx) => partMeshes((payload.ids as string[] | undefined) ?? [], ctx.parts()),
  craft: (_payload, ctx) => craftScene(ctx),
  visible_share: (payload, ctx) => visibleShare(String(payload.id), ctx.viewport()),
  screenshot,
  interference: (payload, ctx) => sceneFits({ ids: idsOf(payload), twins: payload.twins === true }, ctx),
  assembly: (_payload, ctx) => assemblyCheck(ctx),
  merge: async (payload, ctx) => {
    ctx.setAction('Merging parts');

    const done = await ctx.mergeParts((payload.ids as string[] | undefined) ?? []);

    return {
      text: done
        ? `${done}.`
        : 'check_assembly doesn’t offer that merge now. Run it again and pass one listed ids array.',
    };
  },
  silhouette_compare: silhouetteCompare,
  target_compare: (payload, ctx) => targetCompare(payload, ctx),
  fit_view: (payload, ctx) => fitView(payload, ctx),
  trace_outline: (payload, ctx) => traceRequest(payload, ctx),
  photo_scale: (payload) => scaleRequest(payload),
  bom,
  printability,
  slice: slicePlates,
  define_joints: defineJoints,
  find_joint_axes: (payload, ctx) =>
    findJointAxes(payload, {
      parts: ctx.parts,
      joints: () => ctx.project().joints ?? [],
      jointAxes: async (ids) => (await ctx.viewport()?.jointAxes(ids)) ?? { candidates: [], fastened: [], faces: [] },
    }),
  verify: async (payload, ctx) => {
    ctx.setAction('Checking the design');

    return { text: engineeringText(await ctx.verify({ peak: payload.peak === true }), toCad) };
  },
  set_build: setBuild,
  readiness: (_payload, ctx) => readinessRequest(ctx),
  readiness_line: (_payload, ctx) => {
    void ctx.readiness.checkNow();

    return { text: ctx.readiness.deltaSince(ctx.readiness.turnStart()) };
  },
  dispute_finding: (payload, ctx) => disputeFinding(payload, ctx),
  add_sourced: (payload, ctx) => addSourced(payload, ctx),
  import_cad: (payload, ctx) => importCad(payload, ctx),
  build_guide: buildGuide,
  catalog: catalogRequest,
  size_actuators: sizeActuatorsRequest,
  sweep_design: (payload, ctx) => {
    ctx.setAction('Comparing design options');

    return ctx.sweep(payload as SweepPayload);
  },
  downscale_image: async (payload) => ({
    dataUrl: await downscaleDataUrl(String(payload.dataUrl), Number(payload.maxSide) || EVIDENCE_IMAGE_SIDE, 0.88),
  }),
  apply: applyWithCost,
  synthesize_linkage: (payload, ctx) =>
    synthesizeLinkageRequest(payload as LinkagePayload, {
      solve: synthesizeInWorker,
      insert: ctx.insertParts,
      newBase: () => newId('linkage'),
    }),
  ...PORT_HANDLERS,
  ...PLAN_HANDLERS,
  ...ROUTINE_HANDLERS,
  ...CASE_HANDLERS,
  ...CASE_CODE_HANDLERS,
  ...SKILL_HANDLERS,
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
