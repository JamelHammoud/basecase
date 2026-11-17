import type { ScenePart } from '../types/robotics';
import { faceOf, placedPlane, referenceSketch, toPartLocal, type FacePick } from '../utils/sketch/face';
import { captureSupport, SUPPORT_LIMITS } from '../utils/sketch/support';

export interface SketchFaceJob {
  part: ScenePart;
  soup: Float32Array;
  pick: FacePick;
}

export function sketchFace({ part, soup, pick }: SketchFaceJob) {
  if (soup.byteLength > SUPPORT_LIMITS.geometryBytes) return null;

  const local: FacePick =
    'point' in pick ? { point: toPartLocal(pick.point, part) } : { normal: toPartLocal(pick.normal, part, true) };
  const captured = captureSupport(part, soup, local);
  const face = captured?.face ?? faceOf(soup, local);

  return (
    face && {
      plane: placedPlane(face.plane, part),
      reference: captured?.reference ?? referenceSketch(face.edges),
      support: captured?.support,
    }
  );
}
