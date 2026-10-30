import { THREAD } from '../data/hardware';
import type { InterfaceContract, InterfacePlan } from '../types/interfaces';
import type { ScenePart } from '../types/robotics';
import type { ZUpVec } from '../types/skeleton';
import type { ZUpFrame } from './skeletonFrames';

export interface ContractInput {
  owner: string;
  ids: string[];
  envelopes?: Array<{ min: ZUpVec; max: ZUpVec }>;
  datums?: Array<{ name: string; kind?: 'axis' | 'face'; at?: ZUpVec; axis?: ZUpVec; joint?: string }>;
  bolt_patterns?: Array<{ name: string; size: string; axis: ZUpVec; points: ZUpVec[] }>;
  seams?: Array<{ with: string; size: string; count: number }>;
  style?: string;
}

export interface InterfacesPayload {
  contracts: ContractInput[];
  replace?: boolean;
}

type FrameOf = (id: string) => ZUpFrame | undefined;

const sameOwner = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const contractOf = (plan: InterfacePlan | undefined, owner: string) =>
  plan?.contracts.find((c) => sameOwner(c.owner, owner));

function ordered(box: { min: ZUpVec; max: ZUpVec }) {
  const min = box.min.map((v, k) => Math.min(v, box.max[k])) as ZUpVec;
  const max = box.min.map((v, k) => Math.max(v, box.max[k])) as ZUpVec;

  return { min, max };
}

function contractFrom(c: ContractInput): InterfaceContract {
  return {
    owner: c.owner.trim(),
    ids: [...new Set(c.ids)],
    envelopes: (c.envelopes ?? []).map(ordered),
    datums: (c.datums ?? []).map((d) => ({ ...d, kind: d.kind ?? (d.joint ? 'axis' : 'face') })),
    boltPatterns: c.bolt_patterns ?? [],
    seams: c.seams ?? [],
    ...(c.style ? { style: c.style } : {}),
  };
}

function datumProblems(c: InterfaceContract, frameOf: FrameOf): string[] {
  return c.datums.flatMap((d) => {
    if (d.joint) return frameOf(d.joint) ? [] : [`${c.owner}: datum ${d.name} names no joint "${d.joint}"`];

    return d.at && d.axis ? [] : [`${c.owner}: datum ${d.name} needs at and axis, or a joint`];
  });
}

function contractProblems(c: InterfaceContract, plan: InterfacePlan, frameOf: FrameOf): string[] {
  const others = plan.contracts.filter((o) => o !== c);
  const shared = c.ids.filter((id) => others.some((o) => o.ids.includes(id)));
  const sizes = [...c.boltPatterns.map((b) => b.size), ...c.seams.map((s) => s.size)];

  return [
    ...(shared.length ? [`${c.owner}: ${shared.join(', ')} also owned by another contract`] : []),
    ...datumProblems(c, frameOf),
    ...sizes.filter((s) => !(s in THREAD)).map((s) => `${c.owner}: unknown thread ${s}`),
    ...c.seams
      .filter((s) => !contractOf(plan, s.with))
      .map((s) => `${c.owner}: seam with "${s.with}", which has no contract yet`),
  ];
}

export function buildInterfaces(
  payload: InterfacesPayload,
  previous: InterfacePlan | undefined,
  context: { parts: ScenePart[]; frameOf: FrameOf },
) {
  const made = payload.contracts.map(contractFrom);
  const kept = payload.replace
    ? []
    : (previous?.contracts ?? []).filter((c) => !made.some((m) => sameOwner(m.owner, c.owner)));
  const plan: InterfacePlan = { contracts: [...kept, ...made], known: context.parts.map((p) => p.id) };
  const present = new Set(plan.known);
  const problems = plan.contracts.flatMap((c) => contractProblems(c, plan, context.frameOf));
  const lines = plan.contracts.map((c) => {
    const missing = c.ids.filter((id) => !present.has(id)).length;

    return (
      `- ${c.owner}: ${c.ids.length} parts${missing ? ` (${missing} not modeled)` : ''}, ${c.envelopes.length} envelopes, ` +
      `${c.datums.length} datums, ${c.boltPatterns.length} bolt patterns, ${c.seams.length} seams`
    );
  });

  return {
    plan,
    text: [
      `${plan.contracts.length} interface contracts.`,
      ...lines,
      problems.length ? `Problems:\n- ${problems.join('\n- ')}` : '',
      'Each part designer runs check_interfaces with its owner name before it hands back.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
