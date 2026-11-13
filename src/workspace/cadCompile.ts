import { add, r3, rotate, sub, type V3 } from '../agent/agentFrame';
import { cadMeshToScene, mirroredPorts } from '../agent/cadMesh';
import type { ScenePart } from '../types/robotics';
import type { CadLanguage, RenderedCad } from '../utils/platform/types';
import type { DocState, Snapshot } from './types';

type PartCad = NonNullable<ScenePart['cad']>;

export interface CompiledCad extends RenderedCad {
  ok: true;
  positions: number[];
  indices: number[];
}

export interface CadCompileJob {
  key: string;
  language: CadLanguage;
  code: string;
}

export const isCompiled = (rendered: RenderedCad): rendered is CompiledCad =>
  rendered.ok === true && !!rendered.positions?.length && !!rendered.indices?.length;

export const cadKey = (cad: Pick<PartCad, 'language' | 'code'>) => `${cad.language}\n${cad.code}`;

const isPendingWith = (part: ScenePart, key: string) => !!part.cad?.pending && cadKey(part.cad) === key;

const sizeOf = (s: V3) => ({ width: Math.max(0.1, s[0]), height: Math.max(0.1, s[1]), depth: Math.max(0.1, s[2]) });

export function compiledPart(part: ScenePart, rendered: RenderedCad): ScenePart {
  if (!part.cad || !isCompiled(rendered)) return part;

  const cad: PartCad = { ...part.cad };

  delete cad.pending;
  delete cad.audit;

  const mesh = cadMeshToScene({ ...rendered, language: cad.language, code: cad.code });
  const frameOrigin = sub(part.position, rotate(cad.originOffset, part.rotation));
  const ports = rendered.ports?.length ? mirroredPorts(cad.code, rendered.ports) : cad.ports;

  return {
    ...part,
    position: add(frameOrigin, rotate(mesh.center, part.rotation)).map(r3) as V3,
    dimensions: { ...part.dimensions, ...sizeOf(mesh.size) },
    cad: {
      ...cad,
      positions: mesh.positions,
      indices: mesh.indices,
      edges: mesh.edges,
      originOffset: mesh.center,
      baseSize: mesh.size,
      volume: rendered.stats?.volume,
      ...(ports ? { ports } : {}),
      ...(rendered.audit ? { audit: rendered.audit } : {}),
    },
  };
}

export function pendingCompiles(parts: ScenePart[], skip: ReadonlySet<string>, limit: number): CadCompileJob[] {
  const jobs = new Map<string, CadCompileJob>();

  for (const { cad } of parts) {
    if (jobs.size >= limit) break;

    if (!cad?.pending || skip.has(cadKey(cad))) continue;

    jobs.set(cadKey(cad), { key: cadKey(cad), language: cad.language, code: cad.code });
  }

  return [...jobs.values()];
}

export function compiledDoc(d: DocState, key: string, rendered: CompiledCad): DocState {
  const patch = (ps: ScenePart[]) =>
    ps.some((p) => isPendingWith(p, key)) ? ps.map((p) => (isPendingWith(p, key) ? compiledPart(p, rendered) : p)) : ps;
  const snap = (sn: Snapshot) => ({ ...sn, parts: patch(sn.parts) });

  return {
    ...d,
    parts: patch(d.parts),
    past: d.past.map(snap),
    future: d.future.map(snap),
    base: d.base ? patch(d.base) : d.base,
  };
}
