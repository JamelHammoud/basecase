import type { AgentOp } from '../agent/agentScene';
import { planFasten, type FastenArgs } from '../agent/fasten';
import { planMate, type MateArgs } from '../agent/mate';
import { mateJointSpec, type MateJointOption } from '../agent/mateJoint';
import { frameLookup } from '../agent/skeletonFrames';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { portsOf, portText, worldPort, type WorldPort } from '../agent/ports';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { declareJoints } from './agentBuildRequests';

type Payload = Record<string, unknown>;

interface PortContext {
  parts: () => ScenePart[];
  applyOps: (ops: AgentOp[]) => Promise<string>;
  setAction: (action: string) => void;
  project: () => ProjectSettings;
  setProjectNow: (next: ProjectSettings) => void;
  viewport: () => Viewport3DHandle | null;
}

const MAX_PORTS_PER_PART = 40;

function partPorts(part: ScenePart): string {
  const ports = portsOf(part);

  if (!ports.length) return `${part.id}: no ports`;

  const lines = ports.slice(0, MAX_PORTS_PER_PART).map((p) => `  ${portText(p, worldPort(part, p))}`);
  const more = ports.length > MAX_PORTS_PER_PART ? [`  …and ${ports.length - MAX_PORTS_PER_PART} more`] : [];

  return [`${part.id} (${part.name}):`, ...lines, ...more].join('\n');
}

function ports(payload: Payload, ctx: PortContext) {
  const ids = (payload.ids as string[] | undefined) ?? [];
  const parts = ctx.parts();
  const found = ids.map((id) => parts.find((p) => p.id === id));
  const missing = ids.filter((_, i) => !found[i]);

  return {
    text: [
      ...found.filter((p): p is ScenePart => !!p).map(partPorts),
      ...(missing.length ? [`Not found: ${missing.join(', ')}`] : []),
    ].join('\n'),
  };
}

function fastenPlan(payload: Payload, ctx: PortContext) {
  const plan = planFasten(ctx.parts(), payload as unknown as FastenArgs);

  if (typeof plan === 'string') throw new Error(plan);

  ctx.setAction(`Fastening ${(payload.through as string[])[0]}`);

  return plan;
}

type MatePayload = MateArgs & { joint?: MateJointOption };

function mateJoint(args: MatePayload, at: WorldPort, ctx: PortContext): string {
  if (!args.joint) return '';

  const spec = mateJointSpec(ctx.parts(), { ...args, joint: args.joint }, at);

  if (typeof spec === 'string') return `\nNo joint: ${spec}`;

  const { next, text } = declareJoints({ joints: [spec] }, ctx.parts(), ctx.project(), (id) =>
    ctx.viewport()?.servoOutput(id),
  );

  ctx.setProjectNow(next);

  return `\n${text}`;
}

async function mate(payload: Payload, ctx: PortContext) {
  const args = payload as unknown as MatePayload;
  const plan = planMate(ctx.parts(), args, frameLookup(ctx.project()));

  if (typeof plan === 'string') throw new Error(plan);

  const summary = await ctx.applyOps([plan.op]);

  return { text: `${plan.text}\n${summary}${mateJoint(args, plan.target, ctx)}` };
}

export const PORT_HANDLERS = {
  ports,
  fasten_plan: fastenPlan,
  mate,
};
