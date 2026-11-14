import { agentCatalog, type CatalogContext } from '../agent/agentCatalog';
import { COMPONENT_BY_ID } from '../data/components';
import type { AgentOp } from '../agent/agentScene';
import { sizeActuators } from '../utils/actuatorSizing';
import { sizingJoints } from '../utils/actuatorSizingInput';
import { sizingText } from '../utils/actuatorSizingText';
import { storePurchase } from '../components/build/usePurchases';
import { buildBom, describeKey, hardwareKey, specFromHardwareKey } from '../utils/bom';
import { type OnHandCount, onHandRefusals, withOnHand } from '../utils/onHand';
import type { Bom } from '../utils/bomTypes';
import { budgetLine, budgetPlanText } from '../utils/budget';
import type { EngineeringReport, JointLoad } from '../utils/engineeringTypes';
import { prettyJointName } from '../utils/kinematics';
import { platformBridge } from '../utils/platformBridge';
import { LIMB_SHARE, skeletonSizing } from '../utils/skeletonSizing';
import type { ProjectSettings } from '../types/robotics';
import { premiumPick, premiumText } from '../utils/premiumPick';
import type { RequestContext } from './agentRequestHandlers';
import { runEngineeringNow } from './engineeringNow';

type Payload = Record<string, unknown>;

async function sceneBom(ctx: RequestContext): Promise<Bom> {
  return buildBom({
    parts: ctx.parts(),
    project: ctx.project(),
    purchases: await platformBridge.listPurchases(),
    measures: (await ctx.viewport()?.measureParts()) ?? {},
  });
}

const loadReport = (ctx: RequestContext) =>
  runEngineeringNow({ viewport: ctx.viewport(), parts: ctx.parts(), project: ctx.project(), withSweep: false });

const sized = (l: JointLoad) => !!l.joint.actuators?.length || !l.joint.effortNm;

function hardest(report: EngineeringReport): Pick<CatalogContext, 'stance' | 'hold' | 'volts'> {
  const loads = report.joints.filter(sized);
  const stanceOf = (l: JointLoad) => (l.joint.limb === 'leg' ? Math.max(l.stanceNm, l.crouchNm ?? 0) : 0);
  const stance = [...loads].sort((a, b) => stanceOf(b) - stanceOf(a))[0];
  const hold = [...loads].sort((a, b) => b.swingNm - a.swingNm)[0];

  return {
    stance:
      stance && stanceOf(stance) > 0
        ? { nm: stanceOf(stance), joint: prettyJointName(stance.joint.name), crouchDeg: stance.crouchDeg }
        : undefined,
    hold: hold && hold.swingNm > 0 ? { nm: hold.swingNm, joint: prettyJointName(hold.joint.name) } : undefined,
    volts: loads.find((l) => l.volts)?.volts,
  };
}

const usedCounts = (bom: Bom) => Object.fromEntries(bom.lines.map((l) => [l.key, l.qty]));

export async function catalogRequest(payload: Payload, ctx: RequestContext) {
  const project = ctx.project();
  const purchases = await platformBridge.listPurchases();
  const bom = await sceneBom(ctx);
  const needs = project.joints?.length ? hardest(await loadReport(ctx)) : {};
  const budget =
    project.budgetUsd === undefined
      ? undefined
      : { budgetUsd: project.budgetUsd, estimatedUsd: bom.totals.estimatedUsd };

  return { text: agentCatalog(String(payload.query ?? ''), { purchases, used: usedCounts(bom), budget, ...needs }) };
}

function versionedKeys(key: string): string[] {
  if (!key.startsWith('component:') || key.includes('|')) return [];

  const id = key.slice('component:'.length);

  return (COMPONENT_BY_ID[id]?.variants ?? []).map((v) => `${key}|${v.id}`);
}

function keyRefusal(key: unknown): string | undefined {
  if (typeof key !== 'string' || !describeKey(key)) return `${String(key)} isn’t a catalog key`;

  const versions = versionedKeys(key);

  return versions.length ? `${key} needs its version: ${versions.join(', ')}` : undefined;
}

function lineKey(key: string): string {
  const spec = specFromHardwareKey(key);

  return spec ? hardwareKey(spec) : key;
}

export async function recordOnHandRequest(payload: Payload) {
  const given: unknown[] = Array.isArray(payload.counts) ? payload.counts : [];
  const asked = given.map((c) => ({ key: (c as OnHandCount)?.key, count: (c as OnHandCount)?.count }));
  const refusals = asked.length ? onHandRefusals(asked, keyRefusal) : ['no counts given'];

  if (refusals.length)
    return { text: `Nothing recorded: ${refusals.join('; ')}. Use keys from find_parts or get_bom.` };

  const counts = asked.map(({ key, count }) => ({ key: lineKey(key), count }));
  let purchases = await platformBridge.listPurchases();

  for (const { key, count } of counts) purchases = await storePurchase(key, withOnHand(purchases[key], count));

  return { text: `On hand: ${counts.map(({ key, count }) => `${count}× ${key}`).join(', ')}.` };
}

function sizedReply(families: ReturnType<typeof sizeActuators>, totalG: number, lead = '') {
  const cheapest = families.find((f) => !f.failures.length);

  return {
    text: lead + sizingText(families, totalG),
    data: { cheapestActuatorsUsd: cheapest?.actuatorsUsd ?? null, cheapestUsd: cheapest?.costUsd ?? null },
  };
}

function skeletonReply(project: ProjectSettings) {
  if (!project.skeleton) return { text: 'No skeleton. Lay it out with define_skeleton, or declare joints first.' };

  const input = skeletonSizing(project.skeleton);

  if (typeof input === 'string') return { text: input };

  const lead =
    `From the skeleton alone: link lengths, actuator weights, and ${Math.round(LIMB_SHARE * 100)}% of the rest of the ` +
    'estimated mass spread over the links by length (link_mass_g overrides it). Run it again on the model once joints are declared.\n';

  return sizedReply(sizeActuators(input), input.totalG, lead);
}

export async function sizeActuatorsRequest(payload: Payload, ctx: RequestContext) {
  const project = ctx.project();
  const source = payload.source ?? (project.joints?.length ? 'scene' : 'skeleton');

  if (source === 'skeleton') return skeletonReply(project);

  if (!project.joints?.length)
    return { text: 'No joints. Declare them with define_joints, then size their actuators.' };

  ctx.setAction('Sizing the actuators');

  const report = await loadReport(ctx);
  const joints = sizingJoints(
    report,
    ctx.parts(),
    report.joints.map((l) => l.joint),
  );

  if (!joints.length) return { text: 'Every joint already has the maker’s own motor.' };

  return sizedReply(sizeActuators({ joints, totalG: report.massG }), report.massG);
}

function addedComponents(ops: AgentOp[], ctx: RequestContext) {
  const ids = new Set(ops.flatMap((o) => (o.op === 'add' || o.op === 'update' ? [o.part.id] : [])));

  return ctx.parts().filter((p) => ids.has(p.id) && p.kind === 'component' && p.componentId);
}

function premiumLines(ops: AgentOp[], ctx: RequestContext): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const p of addedComponents(ops, ctx)) {
    const pick = premiumPick(p.componentId!, p.componentVariant);

    if (!pick || seen.has(pick.key)) continue;

    seen.add(pick.key);
    out.push(premiumText(pick));
  }

  return out;
}

export async function costNotes(ops: AgentOp[], ctx: RequestContext): Promise<string> {
  if (!ops.some((o) => o.op === 'add' || o.op === 'update')) return '';

  const premium = premiumLines(ops, ctx);
  const budget = ctx.project().budgetUsd === undefined ? '' : budgetLine(await sceneBom(ctx));
  const lines = [budget, ...premium].filter(Boolean);

  return lines.length ? ` ${lines.join(' ')}` : '';
}

export async function budgetPlanNote(ctx: RequestContext): Promise<string> {
  const { budgetUsd, budgetEntered } = ctx.project();

  return budgetUsd === undefined ? '' : budgetPlanText(budgetUsd, await sceneBom(ctx), budgetEntered);
}
