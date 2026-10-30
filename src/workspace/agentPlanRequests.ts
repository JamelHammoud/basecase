import type { AgentOp } from '../agent/agentScene';
import { checkInterfaces, interfaceText } from '../agent/interfaceCheck';
import { buildInterfaces, type InterfacesPayload } from '../agent/interfaces';
import { buildSkeleton, skeletonText, type SkeletonPayload } from '../agent/skeleton';
import { framedFollowOps, resolveFrames, withSkeleton, zUpFrame } from '../agent/skeletonFrames';
import { chainsNow } from './agentAssemblyRequests';
import type { RequestContext } from './agentRequestHandlers';

type Payload = Record<string, unknown>;

export function prepareOps(ops: AgentOp[], ctx: RequestContext) {
  const project = ctx.project();
  const framed = resolveFrames(ops, project);

  return { ops: withSkeleton(framed.ops, project), problems: framed.problems };
}

export async function defineSkeleton(payload: Payload, ctx: RequestContext) {
  const project = ctx.project();
  const build = buildSkeleton(payload as unknown as SkeletonPayload, project.skeleton);

  ctx.setProjectNow({ ...project, skeleton: build.skeleton });

  const follow = framedFollowOps(ctx.parts(), build.moved);
  const moved = follow.length ? `\nParts in moved joint frames: ${await ctx.applyOps(follow)}` : '';

  return { text: skeletonText(build) + moved };
}

export function setInterfaces(payload: Payload, ctx: RequestContext) {
  const project = ctx.project();
  const { plan, text } = buildInterfaces(payload as unknown as InterfacesPayload, project.interfaces, {
    parts: ctx.parts(),
    frameOf: (id) => zUpFrame(project, id),
  });

  ctx.setProjectNow({ ...project, interfaces: plan });

  return { text };
}

export async function checkInterfacesRequest(payload: Payload, ctx: RequestContext) {
  const owner = String(payload.owner ?? '');
  const project = ctx.project();

  ctx.setAction(`Checking the ${owner} interfaces`);

  const chains = await chainsNow(ctx);
  const check = checkInterfaces({
    owner,
    plan: project.interfaces,
    parts: ctx.parts(),
    frameOf: (id) => zUpFrame(project, id),
    chains: chains?.screws ?? null,
    edits: ctx.edits?.(owner) ?? null,
  });

  if (typeof check === 'string') return { text: check, data: { pass: false, problems: 1 } };

  return { text: interfaceText(owner, check), data: { pass: check.pass, problems: check.problems.length } };
}

export const PLAN_HANDLERS = {
  define_skeleton: defineSkeleton,
  set_interfaces: setInterfaces,
  check_interfaces: checkInterfacesRequest,
};
