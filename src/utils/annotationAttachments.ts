import type { SceneAnnotation, ScenePart } from '../types/robotics';

export interface AnnotationAttachment {
  annotation: SceneAnnotation;
  part: ScenePart | undefined;
  position: [number, number, number];
}

function worldPosition(annotation: SceneAnnotation, part: ScenePart | undefined): [number, number, number] {
  if (!annotation.partId || !part || !annotation.offset) return annotation.position;

  return [
    part.position[0] + annotation.offset[0],
    part.position[1] + annotation.offset[1],
    part.position[2] + annotation.offset[2],
  ];
}

export function annotationAttachments(annotations: SceneAnnotation[], parts: ScenePart[]): AnnotationAttachment[] {
  if (!annotations.length) return [];

  const byId = new Map<string, ScenePart>();
  const candidates = annotations.some((a) => a.partId != null) ? parts : [];

  for (const part of candidates) {
    const id = part.id;

    if (!byId.has(id)) byId.set(id, part);
  }

  return annotations.map((annotation) => {
    const part = annotation.partId == null ? undefined : byId.get(annotation.partId);

    return { annotation, part, position: worldPosition(annotation, part) };
  });
}
