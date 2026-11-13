import { scadDimensions } from '../../electron/cad-kernel/dimensions.mjs';
import type { CadAudit, CadCraft, CadExpect, CadPort } from '../types/cadAudit';
import type { ScenePart } from '../types/robotics';
import type { CadTuneAnswer } from '../utils/platform/types';
import { applySpec, type AgentCadPayload } from './agentScene';
import { followMates } from './mateFollow';

export interface DimensionRow {
  name: string;
  value: number;
  min?: number;
  max?: number;
  step: number;
  precision: number;
}

interface KernelCheck {
  name: string;
  want: string;
  got: string;
  pass: boolean | null;
}

type KernelAudit = CadAudit & { checks?: KernelCheck[]; ports?: CadPort[]; error?: string; skipped?: string };

interface KernelResult {
  ok: boolean;
  error?: string;
  positions: number[];
  indices: number[];
  edges?: number[] | null;
  stats?: { volume?: number; triangles?: number };
  ports?: CadPort[];
  audit?: KernelAudit;
}

export type TunedCad = { cad: AgentCadPayload } | { error: string };

const MIN_PRECISION = 2;
const MAX_PRECISION = 4;

const decimals = (v: number) => (String(v).split('.')[1] ?? '').length;

export const isTunable = (part: ScenePart) => part.kind === 'cad_part' && part.cad?.language === 'openscad';

export function dimensionRows(code: string): DimensionRow[] {
  return scadDimensions(code).map(({ name, value, min, max, step = 1 }) => ({
    name,
    value,
    min,
    max,
    step,
    precision: Math.min(MAX_PRECISION, Math.max(MIN_PRECISION, decimals(value), decimals(step))),
  }));
}

const decoded = (result: CadTuneAnswer['result']): KernelResult =>
  result instanceof Uint8Array ? JSON.parse(new TextDecoder().decode(result)) : (result as unknown as KernelResult);

const wallsOf = (w: CadCraft['walls']) =>
  w && { modalMm: w.modalMm, consistent: w.consistent, p5Mm: w.p5Mm, thinShare: w.thinShare };

function storedAudit(audit: KernelAudit | undefined): CadAudit | undefined {
  if (!audit || audit.error || audit.skipped) return undefined;

  const { bodies, voids, genus, nonManifoldEdges, openEdges, hullVolume, craft } = audit;

  return {
    bodies,
    voids,
    genus,
    nonManifoldEdges,
    openEdges,
    hullVolume,
    craft: craft && { ...craft, walls: wallsOf(craft.walls) },
  };
}

export function tunedCad(answer: CadTuneAnswer, expect: CadExpect | undefined): TunedCad {
  const res = decoded(answer.result);

  if (!res.ok) return { error: String(res.error ?? '').split('\n')[0] };

  const broken = (res.audit?.checks ?? []).filter((c) => c.pass === false);

  if (broken.length) return { error: broken.map((c) => `${c.name} needs ${c.want}, got ${c.got}`).join('. ') };

  const ports = res.audit?.ports?.length ? res.audit.ports : res.ports;
  const audit = storedAudit(res.audit);

  return {
    cad: {
      language: 'openscad',
      code: answer.code,
      positions: res.positions,
      indices: res.indices,
      edges: res.edges,
      stats: res.stats,
      ...(ports?.length ? { ports } : {}),
      ...(audit ? { audit } : {}),
      ...(expect ? { expect } : {}),
    },
  };
}

export function withTunedPart(parts: ScenePart[], id: string, cad: AgentCadPayload): ScenePart[] {
  const after = parts.map((p) => (p.id === id ? applySpec(p, { id, cad }) : p));
  const moved = new Map(followMates({ before: parts, after, placed: new Set() }).updated.map((p) => [p.id, p]));

  return after.map((p) => moved.get(p.id) ?? p);
}
