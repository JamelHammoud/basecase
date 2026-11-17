import * as THREE from 'three';
import { withinSupportBudget } from '../utils/sketch/supportBudget';
import { supportFailureParts } from '../utils/sketch/supportFailures';
import type { ScenePart } from '../types/robotics';
import { buildPartGroup, releasePartGroup } from './buildPartMesh';
import { localTriangles } from './meshMeasure';
import { regenerateSketches } from '../utils/sketch/supportRegeneration';
import { supportFingerprint, validSupport, SUPPORT_LIMITS } from '../utils/sketch/support';

function prepare(part: ScenePart) {
  const group = buildPartGroup({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false);

  try {
    let coordinates = 0;

    group.traverse((object) => {
      if (object instanceof THREE.Mesh)
        coordinates += (object.geometry.index?.count ?? object.geometry.getAttribute('position')?.count ?? 0) * 3;
    });

    return coordinates * 8 > SUPPORT_LIMITS.geometryBytes ? ('limit' as const) : localTriangles(group);
  } finally {
    releasePartGroup(group);
  }
}

export function regenerateSketchParts(parts: ScenePart[], force: string[] = []) {
  const started = performance.now();
  const result = withinSupportBudget(parts)
    ? regenerateSketches(parts, prepare, new Set(force))
    : {
        parts,
        failures: supportFailureParts(parts, 'limit').map((p) => ({ id: p.id, cause: 'limit' as const })),
        prepared: 0,
        geometryBytes: 0,
      };
  const byId = new Map(result.parts.map((p) => [p.id, p]));
  const originals = new Map(parts.map((p) => [p.id, p]));

  for (const { id, cause } of result.failures) {
    const part = byId.get(id)!;
    const support = part.sketch!.support;
    const source = validSupport(support) ? byId.get(support.partId) : undefined;

    byId.set(id, {
      ...part,
      sketch: {
        ...part.sketch!,
        support: { ...support!, issue: cause, attempt: source ? supportFingerprint(source) : '' },
      },
    });
  }

  const updated = [...byId.values()].filter((p) => p !== originals.get(p.id));

  return {
    updated,
    failures: result.failures,
    prepared: result.prepared,
    geometryBytes: result.geometryBytes,
    workerMs: performance.now() - started,
    limits: SUPPORT_LIMITS,
  };
}
