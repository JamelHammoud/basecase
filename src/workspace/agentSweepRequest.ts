import { peakLimits, walkJoints } from '../agent/agentPeak';
import { toScene } from '../agent/agentScene';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { buildMjcf } from '../sim/mjcf';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, RobotPoseState, ScenePart } from '../types/robotics';
import { sizeActuators } from '../utils/actuatorSizing';
import { sizingJoints } from '../utils/actuatorSizingInput';
import {
  editMeasures,
  editTriangles,
  servosUsd,
  sweepVariants,
  type PartEdit,
  type SweepParameter,
  type Variant,
} from '../utils/designSweep';
import { reportMetrics, sweepTable, type SweepMetrics, type SweepRow, type SweepSim } from '../utils/designSweepTable';
import { runEngineering } from '../utils/engineering';
import type { EngineeringInputs, EngineeringReport, JointLoad, WalkJoint } from '../utils/engineeringTypes';
import { prettyJointName } from '../utils/kinematics';
import { buildRig } from '../utils/kinematicsRig';
import type { V3 } from '../utils/kinematics';
import { yieldToMain } from '../utils/yieldToMain';
import { engineeringInputs } from './engineeringNow';

export const SWEEP_SECONDS = 4.5;
export const SWEEP_SHOVE_SHARE = 0.3;

const SWEEP_SHOVES: Array<{ at: number; force: V3 }> = [
  { at: 1.5, force: [0, 0, 1] },
  { at: 2.75, force: [1, 0, 0] },
];
const SWEEP_SPAN = { settleS: 0.5, heatFromS: 0.5, heatToS: SWEEP_SECONDS };
const MAX_VALUES = 6;

export interface SweepPayload {
  parameter?: 'servo' | 'battery_offset' | 'foot_scale';
  joints?: string[];
  servos?: string[];
  offsets_mm?: V3[];
  feet?: Array<{ length?: number; width?: number }>;
}

export interface SweepContext {
  sim: Simulation;
  parts: ScenePart[];
  project: ProjectSettings;
  pose: RobotPoseState | undefined;
  viewport: Viewport3DHandle | null;
}

interface SweepRun extends SweepContext {
  measures: EngineeringInputs['measures'];
}

export function sweepParameter(p: SweepPayload): SweepParameter | string {
  if (p.parameter === 'servo')
    return { kind: 'servo', joints: p.joints ?? [], values: (p.servos ?? []).slice(0, MAX_VALUES) };

  if (p.parameter === 'battery_offset')
    return { kind: 'battery', values: (p.offsets_mm ?? []).slice(0, MAX_VALUES).map((v) => toScene(v)) };

  if (p.parameter === 'foot_scale') return { kind: 'foot', values: (p.feet ?? []).slice(0, MAX_VALUES) };

  return 'parameter is "servo", "battery_offset" or "foot_scale".';
}

interface Scene {
  label: string;
  input: EngineeringInputs;
  variant?: Variant;
}

function cheapestUsd(report: EngineeringReport, input: EngineeringInputs): number | undefined {
  const joints = sizingJoints(report, input.parts, input.project.joints ?? []);

  if (!joints.length) return undefined;

  return sizeActuators({ joints, totalG: report.massG }).find((f) => !f.failures.length)?.costUsd;
}

function simWorst(report: EngineeringReport, peaks: Record<string, WalkJoint>): Omit<SweepSim, 'fellAt'> {
  const legs = report.joints.filter((l) => l.kind === 'stance' && l.stallNm && peaks[l.joint.id]);
  const share = (l: JointLoad) => peaks[l.joint.id].p99Nm / l.stallNm!;
  const worst = [...legs].sort((a, b) => share(b) - share(a))[0];

  return worst ? { worstShare: share(worst), worstJoint: prettyJointName(worst.joint.name) } : {};
}

function sceneTriangles(ctx: SweepRun, vp: Viewport3DHandle, scene: Scene) {
  const edits = scene.variant?.edits ?? new Map<string, PartEdit>();
  const original = new Map(ctx.parts.map((p) => [p.id, p]));

  return (id: string) => {
    const tris = vp.partTriangles(id);
    const edit = edits.get(id);
    const part = original.get(id);

    return tris && edit && part ? editTriangles(tris, part, edit, ctx.measures[id]) : tris;
  };
}

async function holdAndShove(ctx: SweepRun, scene: Scene, report: EngineeringReport): Promise<SweepSim | string> {
  const vp = ctx.viewport;

  if (!vp) return 'no canvas';

  const { parts, measures, project } = scene.input;
  const model = buildMjcf({
    parts,
    rig: buildRig(project.joints ?? [], parts),
    project,
    pose: ctx.pose,
    measures,
    partTriangles: sceneTriangles(ctx, vp, scene),
    posedFloor: vp.posedFloor(),
  });

  if (!model.robots.some((r) => r.floating)) return 'no legs';

  const weight = (report.massG / 1000) * 9.81 * SWEEP_SHOVE_SHARE;
  const run = await ctx.sim.runOn(model, {
    seconds: SWEEP_SECONDS,
    controller: { kind: 'hold' },
    pushes: SWEEP_SHOVES.map((s) => ({ at: s.at, force: s.force.map((v) => v * weight) as V3 })),
    forceLimits: (m) => peakLimits(report.joints, m),
    trace: true,
  });
  const robot = run.stats.robots.find((r) => model.robots.some((x) => x.key === r.key && x.floating));
  const peaks = run.trace ? walkJoints(run.model, run.trace, report.joints, SWEEP_SPAN) : {};

  return { fellAt: robot?.fellAt ?? null, ...simWorst(report, peaks) };
}

async function measure(ctx: SweepRun, scene: Scene): Promise<SweepMetrics> {
  const report = runEngineering(scene.input);
  const joints = scene.input.project.joints ?? [];
  const metrics = reportMetrics(report, {
    servosUsd: servosUsd(scene.input.parts, joints),
    sizedUsd: cheapestUsd(report, scene.input),
  });
  const sim = await holdAndShove(ctx, scene, report).catch((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  );

  return { ...metrics, sim };
}

function variantLabel(payload: SweepPayload, v: Variant, i: number): string {
  const offset = payload.parameter === 'battery_offset' ? payload.offsets_mm?.[i] : undefined;

  return offset ? `battery moved ${offset.map((x) => Math.round(x)).join(', ')} mm` : v.label;
}

export async function sweepRequest(ctx: SweepContext, payload: SweepPayload): Promise<{ text: string }> {
  const param = sweepParameter(payload);

  if (typeof param === 'string') return { text: param };

  const base = await engineeringInputs(ctx.viewport, ctx.parts, ctx.project);
  const variants = sweepVariants(ctx.parts, base.project.joints ?? [], param);

  if (typeof variants === 'string') return { text: variants };

  const scenes: Scene[] = [
    { label: 'as modeled', input: base },
    ...variants.map((v, i) => ({
      label: variantLabel(payload, v, i),
      variant: v,
      input: { ...base, parts: v.parts, measures: editMeasures(base.measures, ctx.parts, v.edits) },
    })),
  ];
  const results: Array<Promise<SweepMetrics>> = [];
  const run: SweepRun = { ...ctx, measures: base.measures };

  for (const scene of scenes) {
    results.push(measure(run, scene));
    await yieldToMain();
  }

  const [now, ...rest] = await Promise.all(results);

  return {
    text: sweepText({
      base: { label: scenes[0].label, metrics: now },
      rows: rest.map((metrics, i) => ({ label: scenes[i + 1].label, metrics })),
    }),
  };
}

function sweepText({ base, rows }: { base: SweepRow; rows: SweepRow[] }): string {
  return [
    sweepTable(base, rows),
    '',
    `Each row is a copy of the scene with one change; nothing in the scene was edited. Servo torque is the static check (leg joints on one leg at the gait's crouch). Servos as chosen is the list price of the scene's servos; cheapest passing set is size_actuators' cheapest servos, battery and regulator that pass. Hold + shoves holds the pose in MuJoCo for ${SWEEP_SECONDS} s with servos limited to 0.7 × stall and shoves of ${SWEEP_SHOVE_SHARE} × body weight forward and sideways; the share is the 99th-percentile torque a leg joint asks for over its stall. Apply the winner yourself.`,
  ].join('\n');
}
