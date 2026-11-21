import type { BodyMotionPreview } from './bodyMotionTypes';
import { BODY_PREVIEW_VERTICES } from './bodyMotionTypes';

function boundedNumbers(values: number[], max: number): boolean {
  return (
    Array.isArray(values) &&
    values.length <= max &&
    values.every((value) => Number.isFinite(value) && Math.abs(value) <= 1e9)
  );
}

export function safeMotionPreview(preview: BodyMotionPreview): boolean {
  if (!preview || !Array.isArray(preview.parts) || !Array.isArray(preview.bodies) || !Array.isArray(preview.poses))
    return false;

  const validParts =
    preview.parts.length > 0 &&
    preview.parts.length <= 512 &&
    preview.parts.every(
      (part) =>
        part.kind === 'mesh' &&
        typeof part.id === 'string' &&
        boundedNumbers(part.position, 3) &&
        part.position.length === 3 &&
        !!part.mesh &&
        !part.mesh.file &&
        !part.mesh.source &&
        !part.mesh.visual &&
        boundedNumbers(part.mesh.positions, BODY_PREVIEW_VERTICES * 3) &&
        part.mesh.positions.length % 3 === 0 &&
        boundedNumbers(part.mesh.indices, BODY_PREVIEW_VERTICES * 6) &&
        part.mesh.indices.every(
          (index) => Number.isInteger(index) && index >= 0 && index < part.mesh!.positions.length / 3,
        ),
    );

  if (
    !validParts ||
    preview.parts.reduce((sum, part) => sum + part.mesh!.positions.length / 3, 0) > BODY_PREVIEW_VERTICES
  )
    return false;

  return (
    Array.isArray(preview.units) &&
    preview.units.every((unit) => unit === 'rad' || unit === 'm') &&
    preview.units.length === preview.positions[0]?.length &&
    safeBodiesAndPoses(preview)
  );
}

function safeBodiesAndPoses(preview: BodyMotionPreview): boolean {
  return (
    preview.bodies.length > 0 &&
    preview.bodies.length <= 128 &&
    preview.bodies.every(
      (body) =>
        boundedNumbers(body.origin, 3) &&
        body.origin.length === 3 &&
        Array.isArray(body.parts) &&
        body.parts.every((id) => preview.parts.some((part) => part.id === id)),
    ) &&
    preview.poses.length === preview.times.length &&
    preview.poses.every((pose) => pose.length === preview.bodies.length * 7 && boundedNumbers(pose, 896))
  );
}
