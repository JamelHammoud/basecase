import type { FastenerChain } from '../assembly/assemblyTypes';
import { THREAD } from '../data/hardware';
import type { BoltPattern, InterfaceBox, InterfaceContract, InterfaceDatum, InterfacePlan } from '../types/interfaces';
import type { ScenePart } from '../types/robotics';
import type { ZUpVec } from '../types/skeleton';
import { dot, lineDistance, norm, sub } from '../utils/engineeringMath';
import { r1, toCad } from './agentFrame';
import { partBoundsCad } from './agentScene';
import { contractOf } from './interfaces';
import { portsOf, worldPort } from './ports';
import type { ZUpFrame } from './skeletonFrames';

export const DATUM_MM = 0.2;
export const ENVELOPE_MM = 0.5;

const PARALLEL = Math.cos(Math.PI / 180);
const HOLE_KINDS = new Set(['bore', 'screw', 'boss']);

export interface InterfaceCheckInput {
  owner: string;
  plan: InterfacePlan | undefined;
  parts: ScenePart[];
  frameOf: (id: string) => ZUpFrame | undefined;
  chains: FastenerChain[] | null;
  edits: string[] | null;
}

export interface InterfaceCheck {
  pass: boolean;
  problems: string[];
  passed: string[];
}

interface WorldPortZ {
  part: string;
  name: string;
  kind: string;
  at: ZUpVec;
  axis: ZUpVec;
}

interface Line {
  at: ZUpVec;
  axis: ZUpVec;
}

const fmt = (v: ZUpVec) => `[${v.map((x) => r1(x) + 0).join(', ')}]`;
const pointDistance = (a: ZUpVec, b: ZUpVec) => Math.hypot(...sub(a, b));
const parallel = (a: ZUpVec, b: ZUpVec) => Math.abs(dot(norm(a), norm(b))) >= PARALLEL;

function subassembly(contract: InterfaceContract, plan: InterfacePlan, input: InterfaceCheckInput): ScenePart[] {
  const others = new Set(plan.contracts.filter((c) => c !== contract).flatMap((c) => c.ids));
  const known = new Set(plan.known);
  const created = (input.edits ?? []).filter((id) => !known.has(id) && !others.has(id));
  const ids = new Set([...contract.ids, ...created]);

  return input.parts.filter((p) => ids.has(p.id));
}

function overshoot(b: { min: number[]; max: number[] }, box: InterfaceBox): number {
  return Math.max(0, ...[0, 1, 2].flatMap((k) => [box.min[k] - b.min[k], b.max[k] - box.max[k]]));
}

function envelopeLines(contract: InterfaceContract, parts: ScenePart[], out: InterfaceCheck) {
  if (!contract.envelopes.length) return;

  const solids = parts.filter((p) => p.role === 'solid' && p.visible);
  const outside = solids.flatMap((p) => {
    const b = partBoundsCad(p);
    const worst = Math.min(...contract.envelopes.map((box) => overshoot(b, box)));

    return worst > ENVELOPE_MM ? [`${p.id} is ${r1(worst)} mm outside its envelope`] : [];
  });

  if (outside.length) out.problems.push(...outside.map((l) => `Envelope: ${l}.`));
  else out.passed.push(`envelope (${solids.length} parts)`);
}

function worldPorts(parts: ScenePart[]): WorldPortZ[] {
  return parts.flatMap((p) =>
    portsOf(p).map((port) => {
      const w = worldPort(p, port);

      return { part: p.id, name: port.name, kind: port.kind, at: toCad(w.position), axis: toCad(w.axis) };
    }),
  );
}

function datumLine(d: InterfaceDatum, frameOf: InterfaceCheckInput['frameOf']): Line | null {
  const f = d.joint ? frameOf(d.joint) : undefined;

  if (f) return { at: f.origin, axis: f.axis };

  return d.at && d.axis ? { at: d.at, axis: d.axis } : null;
}

const offBy = (d: InterfaceDatum, line: Line, p: WorldPortZ) =>
  d.kind === 'axis' ? lineDistance(p.at, line.at, norm(line.axis)) : pointDistance(p.at, line.at);

function datumLines(contract: InterfaceContract, ports: WorldPortZ[], input: InterfaceCheckInput, out: InterfaceCheck) {
  for (const d of contract.datums) {
    const line = datumLine(d, input.frameOf);

    if (!line) {
      out.problems.push(`Datum ${d.name}: no position (its joint is gone).`);

      continue;
    }

    const candidates = ports.filter((p) => parallel(p.axis, line.axis)).map((p) => ({ p, off: offBy(d, line, p) }));
    const best = candidates.sort((a, b) => a.off - b.off)[0];

    if (best && best.off <= DATUM_MM) out.passed.push(`datum ${d.name} (${best.p.part}:${best.p.name})`);
    else out.problems.push(datumMiss(d, line, best));
  }
}

function datumMiss(d: InterfaceDatum, line: Line, best: { p: WorldPortZ; off: number } | undefined): string {
  const where = `${d.kind} at ${fmt(line.at)} along ${fmt(line.axis)}`;

  if (!best) return `Datum ${d.name}: no port lies parallel to the ${where}. Add one, or mate a part to it.`;

  return `Datum ${d.name}: nearest port ${best.p.part}:${best.p.name} is ${r1(best.off)} mm off the ${where}.`;
}

function chainLine(c: FastenerChain): Line {
  return { at: toCad(c.tip), axis: toCad(c.axis) };
}

function pointMatched(point: ZUpVec, pattern: BoltPattern, holes: Line[]): boolean {
  return holes.some((h) => parallel(h.axis, pattern.axis) && lineDistance(point, h.at, norm(h.axis)) <= DATUM_MM);
}

function boltLines(contract: InterfaceContract, ports: WorldPortZ[], chains: FastenerChain[], out: InterfaceCheck) {
  const ids = new Set(contract.ids);
  const holes: Line[] = [
    ...ports.filter((p) => HOLE_KINDS.has(p.kind)).map((p) => ({ at: p.at, axis: p.axis })),
    ...chains.filter((c) => c.stack.some((id) => ids.has(id))).map(chainLine),
  ];

  for (const pattern of contract.boltPatterns) {
    const missing = pattern.points.filter((pt) => !pointMatched(pt, pattern, holes));

    if (!missing.length) out.passed.push(`bolt pattern ${pattern.name} (${pattern.points.length} ${pattern.size})`);
    else
      out.problems.push(
        `Bolt pattern ${pattern.name}: ${pattern.points.length - missing.length} of ${pattern.points.length} ` +
          `${pattern.size} holes found; none at ${missing.map(fmt).join(', ')}.`,
      );
  }
}

function seamLines(contract: InterfaceContract, input: InterfaceCheckInput, out: InterfaceCheck) {
  const mine = new Set(contract.ids);

  for (const seam of contract.seams) {
    const other = new Set(contractOf(input.plan, seam.with)?.ids ?? []);
    const d = THREAD[seam.size as keyof typeof THREAD]?.d;
    const crossing = (input.chains ?? []).filter(
      (c) =>
        Math.abs(c.d - (d ?? c.d)) < 0.05 && c.stack.some((id) => mine.has(id)) && c.stack.some((id) => other.has(id)),
    );

    if (crossing.length >= seam.count) out.passed.push(`seam with ${seam.with} (${crossing.length} ${seam.size})`);
    else
      out.problems.push(
        `Seam with ${seam.with}: ${crossing.length} of ${seam.count} ${seam.size} screws cross it. Use fasten through both sides.`,
      );
  }
}

function ownershipLines(
  contract: InterfaceContract,
  plan: InterfacePlan,
  input: InterfaceCheckInput,
  out: InterfaceCheck,
) {
  if (!input.edits) return;

  const mine = new Set(contract.ids);
  const known = new Set(plan.known);
  const theirs = new Set(plan.contracts.filter((c) => c !== contract).flatMap((c) => c.ids));
  const partners = new Set(
    (input.chains ?? []).filter((c) => c.stack.some((id) => mine.has(id))).flatMap((c) => c.stack),
  );
  const foreign = input.edits.filter((id) => !mine.has(id) && (known.has(id) || theirs.has(id)));
  const outside = foreign.filter((id) => !partners.has(id));
  const seams = foreign.filter((id) => partners.has(id));

  if (outside.length)
    out.problems.push(
      `Ownership: edited ${outside.join(', ')}, which ${contract.owner} doesn't own. Undo those edits, or ask the lead to move them into this contract.`,
    );
  else out.passed.push(seams.length ? `ownership (holes cut across seams in ${seams.join(', ')})` : 'ownership');
}

export function checkInterfaces(input: InterfaceCheckInput): InterfaceCheck | string {
  const plan = input.plan;
  const contract = contractOf(plan, input.owner);

  if (!plan || !contract) {
    const owners = plan?.contracts.map((c) => c.owner).join(', ');

    return `No contract for "${input.owner}".${owners ? ` Contracts: ${owners}.` : ' The lead writes them with set_interfaces.'}`;
  }

  const out: InterfaceCheck = { pass: false, problems: [], passed: [] };
  const parts = subassembly(contract, plan, input);
  const ports = worldPorts(parts);
  const absent = contract.ids.filter((id) => !input.parts.some((p) => p.id === id));

  if (absent.length) out.problems.push(`Missing: ${absent.join(', ')} not in the scene.`);

  envelopeLines(contract, parts, out);
  datumLines(contract, ports, input, out);
  boltLines(contract, ports, input.chains ?? [], out);
  seamLines(contract, input, out);
  ownershipLines(contract, plan, input, out);
  out.pass = out.problems.length === 0;

  return out;
}

export function interfaceText(owner: string, check: InterfaceCheck): string {
  const head = check.pass
    ? `Interfaces for ${owner}: pass. You can hand back.`
    : `Interfaces for ${owner}: ${check.problems.length} problems. Fix them before you hand back.`;

  return [
    head,
    ...check.problems.map((p) => `- ${p}`),
    check.passed.length ? `Passed: ${check.passed.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
