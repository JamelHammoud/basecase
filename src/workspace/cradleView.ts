import { Matrix4, Vector3 } from 'three';
import type { BuildStepView } from '../three/viewport/types';
import type { PreparedCradle } from '../print/cradleJob';
import type { V3 } from '../guide/guideTypes';

export function cradleView(
  view: BuildStepView | null,
  prepared: PreparedCradle | null,
  removing: boolean,
  preview?: { origin: V3; down: V3 | null },
): BuildStepView | null {
  if (!view) return null;

  if (!prepared) return directionView(view, preview);

  const { geometry } = prepared;
  const frame = new Matrix4().fromArray(geometry.toWorld);
  const offset = new Vector3(0, -(geometry.depthMm + geometry.baseMm + 10), 0)
    .transformDirection(frame)
    .multiplyScalar(geometry.depthMm + geometry.baseMm + 10);
  const from = new Vector3(0, geometry.baseMm + geometry.depthMm / 2, 0).applyMatrix4(frame);
  const to = from.clone().add(offset);

  if (removing) frame.premultiply(new Matrix4().makeTranslation(...offset.toArray()));

  return {
    ...view,
    tooling: { positions: geometry.positions, normals: geometry.normals, matrix: frame.toArray() },
    arrows: removing ? [...view.arrows, { from: from.toArray(), to: to.toArray() }] : view.arrows,
  };
}

function directionView(view: BuildStepView, preview?: { origin: V3; down: V3 | null }): BuildStepView {
  if (!preview?.down) return view;

  const to = new Vector3(...preview.origin).addScaledVector(new Vector3(...preview.down), 30).toArray();

  return { ...view, arrows: [...view.arrows, { from: preview.origin, to }] };
}
