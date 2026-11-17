import { registerSourced } from '../data/sourcedItems';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { componentMeshesReady, provideMeshFiles } from '../three/componentMeshes';
import { localTriangles } from '../three/meshMeasure';
import { analyzeBoardGeometry, boardGeometryKey, type BoardGeometry } from './boardGeometry';
import type { ElectricalInput, ElectricalRequirement } from './electricalTypes';
import { boardComponents } from './boardComponents';
import { validBoardDefinition, validBoardPart } from './boardValidation';
import { boardRequirement } from './boardConstraints';

async function digest(positions: Float32Array) {
  const bytes = await crypto.subtle.digest('SHA-256', positions.buffer as ArrayBuffer);

  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareBoardGeometry(input: ElectricalInput) {
  if (typeof document !== 'undefined') throw new Error('Board clearance needs a worker.');

  const start = performance.now();

  registerSourced(input.project.sourced ?? []);
  provideMeshFiles(input.meshFiles);

  const board = input.project.electronicsBoard;

  if (!board) throw new Error('Board definition is required.');

  if (!validBoardDefinition(board)) throw new Error('Repair the board definition before placement.');

  const host = input.parts.find((part) => part.id === board?.partId);

  if (!host || !validBoardPart(host))
    return {
      requirements: [boardRequirement(board, 'geometry', 'Restore the board’s rectangular solid.')],
      evidence: {},
      bytes: 0,
      durationMs: performance.now() - start,
    };

  const components = boardComponents(host, board);
  const parts = [...input.parts.filter((part) => part.role === 'solid' && part.id !== board?.partId), ...components];

  await componentMeshesReady(parts.flatMap((part) => (part.componentId ? [part.componentId] : [])));

  const geometry: BoardGeometry = { key: boardGeometryKey(input), triangles: {} };
  const evidence: Record<string, string> = {};
  const missing: ElectricalRequirement[] = [];
  let coordinates = 0;

  for (const part of parts) {
    if (coordinates > 9_000_000) break;

    const group = buildPartGroup(part, false, { shareGeometry: true });

    try {
      if (group.userData.placeholder) {
        missing.push(
          boardRequirement(board, 'geometry', `${part.name}: prepare complete geometry for board clearance.`),
        );

        continue;
      }

      const triangles = localTriangles(group);

      coordinates += triangles.length;
      geometry.triangles[part.id] = triangles;
      evidence[part.id] = await digest(triangles);
    } finally {
      releasePartGroup(group);
    }
  }

  const result = analyzeBoardGeometry(input, geometry);

  return {
    requirements: [...result.requirements, ...missing],
    evidence,
    bytes: coordinates * 4,
    durationMs: performance.now() - start,
  };
}
