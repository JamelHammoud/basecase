import { Box3, Vector3, Vector4, type Object3D, type PerspectiveCamera, type Vector2 } from 'three';

export class SelectionScreenRect {
  private readonly box = new Box3();

  private readonly corner = new Vector3();

  private readonly rect = new Vector4();

  update(groups: Object3D[], camera: PerspectiveCamera, pad: Vector2): Vector4 | null {
    const { box, corner, rect } = this;

    box.makeEmpty();

    for (const group of groups) box.expandByObject(group);

    if (box.isEmpty()) return null;

    rect.set(Infinity, Infinity, -Infinity, -Infinity);

    for (let i = 0; i < 8; i++) {
      corner
        .set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
        .applyMatrix4(camera.matrixWorldInverse);

      if (corner.z > -camera.near) return rect.set(-1, -1, 1, 1);

      corner.applyMatrix4(camera.projectionMatrix);
      rect.x = Math.min(rect.x, corner.x);
      rect.y = Math.min(rect.y, corner.y);
      rect.z = Math.max(rect.z, corner.x);
      rect.w = Math.max(rect.w, corner.y);
    }

    rect.set(
      Math.max(-1, rect.x - pad.x),
      Math.max(-1, rect.y - pad.y),
      Math.min(1, rect.z + pad.x),
      Math.min(1, rect.w + pad.y),
    );

    return rect.x < rect.z && rect.y < rect.w ? rect : null;
  }
}
