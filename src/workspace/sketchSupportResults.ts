import { rememberSupport } from '../utils/sketch/supportVerified';
import { editWithOperands } from '../booleans/operands';
import { followMates } from '../agent/mateFollow';
import type { ScenePart } from '../types/robotics';
import type { DocState } from './types';

function updatedPart(part: ScenePart, patch: ScenePart | undefined): ScenePart {
  if (!patch) return part;

  const issue = patch.sketch?.support?.issue;

  if (!issue) {
    const updated = {
      ...part,
      position: patch.position,
      rotation: patch.rotation,
      dimensions: patch.dimensions,
      role: patch.role,
      customNodes: patch.customNodes,
      sketch: patch.sketch,
    };

    rememberSupport(updated.sketch);

    return updated;
  }

  if (!part.sketch) return part;

  return {
    ...part,
    sketch: { ...part.sketch, support: { ...part.sketch.support!, issue, attempt: patch.sketch?.support?.attempt } },
  };
}

export function applySketchSupportResults(doc: DocState, source: ScenePart[], updated: ScenePart[]): DocState {
  if (doc.parts !== source || !updated.length) return doc;

  const patches = new Map(updated.map((p) => [p.id, p]));
  const parts = editWithOperands(source, (flat) => {
    const after = flat.map((p) => updatedPart(p, patches.get(p.id)));
    const result = followMates({ before: flat, after, placed: new Set() });
    const followed = new Map(result.updated.map((p) => [p.id, p]));

    return after.map((p) => followed.get(p.id) ?? p);
  });

  return { ...doc, parts };
}
