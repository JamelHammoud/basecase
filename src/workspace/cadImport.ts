import type { ScenePart } from '../types/robotics';
import type { CadBody, OpenedCad } from '../utils/platform/types';
import { platformBridge } from '../utils/platformBridge';
import { PRINTED_TAG } from './partFactories';
import type { Vec3 } from './types';

const SMALLEST_MM = 0.01;

const round = (v: number) => Math.round(v * 100) / 100;

interface CadPlacement {
  name: string;
  file: string;
  at?: Vec3 | null;
  newId: (prefix: string) => string;
}

function bodyMeshes({ bodies, data }: OpenedCad) {
  let at = 0;

  return bodies.map((body) => {
    const positionBytes = body.vertices * 12;
    const indexBytes = body.triangles * 12;
    const positions = new Float32Array(data.slice(at, at + positionBytes).buffer);
    const indices = new Uint32Array(data.slice(at + positionBytes, at + positionBytes + indexBytes).buffer);

    at += positionBytes + indexBytes;

    return { positions: Array.from(positions), indices: Array.from(indices) };
  });
}

function footprint(bodies: CadBody[]) {
  const lo = [0, 1, 2].map((k) => Math.min(...bodies.map((b) => b.center[k] - b.size[k] / 2)));
  const hi = [0, 1, 2].map((k) => Math.max(...bodies.map((b) => b.center[k] + b.size[k] / 2)));

  return { mid: lo.map((v, k) => (v + hi[k]) / 2), floor: lo[1] };
}

export function cadParts(opened: OpenedCad, { name, file, at, newId }: CadPlacement): ScenePart[] {
  const { bodies } = opened;
  const meshes = bodyMeshes(opened);
  const { mid, floor } = footprint(bodies);
  const base = at ?? [0, 0, 0];
  const group = bodies.length > 1 ? { group: { id: newId('group'), name } } : {};

  return bodies.map((body, i) => {
    const size = body.size.map((v) => Math.max(v, SMALLEST_MM)) as Vec3;

    return {
      id: newId('mesh'),
      name: body.name || (bodies.length > 1 ? `${name} ${i + 1}` : name),
      kind: 'mesh',
      category: 'structure',
      role: 'solid',
      position: [
        round(base[0] + body.center[0] - mid[0]),
        round(base[1] + body.center[1] - floor),
        round(base[2] + body.center[2] - mid[2]),
      ],
      rotation: [0, 0, 0],
      dimensions: { width: round(size[0]), height: round(size[1]), depth: round(size[2]) },
      color: body.color,
      note: '',
      mechanicalTag: PRINTED_TAG,
      visible: true,
      locked: false,
      mesh: { ...meshes[i], baseSize: size, source: file, file },
      ...group,
    };
  });
}

export async function cadPartsFromFile({ file, at, newId }: { file: File } & Omit<CadPlacement, 'name' | 'file'>) {
  const opened = await platformBridge.openCadFile(file.name, new Uint8Array(await file.arrayBuffer()));

  return cadParts(opened, { name: file.name.replace(/\.[^.]+$/, '') || 'CAD', file: file.name, at, newId });
}
