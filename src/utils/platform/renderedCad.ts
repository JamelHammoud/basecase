import type { CadAudit, CadCraft, CadPort } from '../../types/cadAudit';
import type { PortKind, PortVec } from '../../types/ports';
import type { RenderedCad } from './types';

const MAX_PORTS = 200;
const MAX_RADII = 64;
const MAX_ERROR_CHARS = 2000;
const PORT_KINDS = new Set<string>(['bore', 'boss', 'face', 'output', 'hole_circle', 'screw']);
const PORT_CHECKS = new Set<string>(['ok', 'failed', 'unchecked']);
const UNKNOWN_FAILURE = 'The CAD kernel failed.';

type Loose = Record<string, unknown>;

const isLoose = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numberOrNull = (v: unknown) => (finite(v) ? v : null);
const isVec = (v: unknown): v is PortVec => Array.isArray(v) && v.length === 3 && v.every(finite);
const isTriples = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length > 0 && v.length % 3 === 0 && v.every(finite);

const isIndices = (v: unknown, vertices: number): v is number[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length % 3 === 0 &&
  v.every((i) => Number.isInteger(i) && i >= 0 && i < vertices);

const failed = (error: unknown): RenderedCad => ({
  ok: false,
  error: typeof error === 'string' && error ? error.slice(0, MAX_ERROR_CHARS) : UNKNOWN_FAILURE,
});

const isPortShape = (p: unknown): p is Loose & { name: string; position: PortVec; axis: PortVec; kind: PortKind } =>
  isLoose(p) && typeof p.name === 'string' && isVec(p.position) && isVec(p.axis) && PORT_KINDS.has(String(p.kind));

function checkedPort(p: unknown): CadPort[] {
  if (!isPortShape(p)) return [];

  const { diameterMm, check, problem } = p;

  return [
    {
      name: p.name.slice(0, 80),
      position: p.position,
      axis: p.axis,
      kind: p.kind,
      ...(finite(diameterMm) && diameterMm > 0 ? { diameterMm } : {}),
      ...(PORT_CHECKS.has(String(check)) ? { check: check as CadPort['check'] } : {}),
      ...(typeof problem === 'string' ? { problem: problem.slice(0, 300) } : {}),
    },
  ];
}

function checkedWalls(w: unknown): CadCraft['walls'] {
  if (!isLoose(w)) return null;

  const { modalMm, consistent, p5Mm, thinShare } = w;

  if (!finite(modalMm) || !finite(consistent) || !finite(p5Mm) || !finite(thinShare)) return null;

  return { modalMm, consistent, p5Mm, thinShare };
}

function checkedCraft(c: unknown): CadCraft | undefined {
  if (!isLoose(c)) return undefined;

  const { dominantShare, areaMm2, radii } = c;

  if (!finite(dominantShare) || !finite(areaMm2) || !Array.isArray(radii)) return undefined;

  return {
    envelopeSharp: numberOrNull(c.envelopeSharp),
    interiorSharp: numberOrNull(c.interiorSharp),
    dominantRadius: numberOrNull(c.dominantRadius),
    dominantShare,
    radii: radii.filter(finite).slice(0, MAX_RADII),
    solidity: numberOrNull(c.solidity),
    boxiness: numberOrNull(c.boxiness),
    thicknessMm: numberOrNull(c.thicknessMm),
    areaMm2,
    walls: checkedWalls(c.walls),
  };
}

function checkedAudit(a: unknown): CadAudit | undefined {
  if (!isLoose(a) || a.error || a.skipped) return undefined;

  const { bodies, nonManifoldEdges, openEdges } = a;

  if (!finite(bodies) || !finite(nonManifoldEdges) || !finite(openEdges)) return undefined;

  const craft = checkedCraft(a.craft);

  return {
    bodies,
    genus: numberOrNull(a.genus),
    nonManifoldEdges,
    openEdges,
    hullVolume: numberOrNull(a.hullVolume),
    ...(craft ? { craft } : {}),
  };
}

const checkedPorts = (a: unknown): CadPort[] =>
  isLoose(a) && Array.isArray(a.ports) ? a.ports.slice(0, MAX_PORTS).flatMap(checkedPort) : [];

const volumeOf = (stats: unknown) => (isLoose(stats) && finite(stats.volume) ? { volume: stats.volume } : {});

export function checkedRender(raw: unknown): RenderedCad {
  if (!isLoose(raw)) return failed(undefined);

  if (raw.ok !== true) return failed(raw.error);

  const { positions, indices } = raw;

  if (!isTriples(positions) || !isIndices(indices, positions.length / 3)) return failed(undefined);

  const audit = checkedAudit(raw.audit);
  const ports = checkedPorts(raw.audit);

  return {
    ok: true,
    positions,
    indices,
    edges: isTriples(raw.edges) ? raw.edges : null,
    stats: volumeOf(raw.stats),
    ...(audit ? { audit } : {}),
    ...(ports.length ? { ports } : {}),
  };
}

export const parsedReply = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));
