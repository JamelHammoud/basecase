import * as THREE from 'three';
import { onStressFields, shownStress, stressFieldOf } from '../../strength/fields';
import type { StressField } from '../../strength/types';
import { partObjects } from './measurements';
import type { ViewportContext } from './viewportContext';

const CALM = new THREE.Color('#0d99ff');
const TIGHT = new THREE.Color('#f5b83d');
const BREAKS = new THREE.Color('#f04848');
const PASS_RATIO = 0.5;
const FAIL_RATIO = 1 / 1.3;
const UNIT = new THREE.Vector3(1, 1, 1);

export function stressColor(ratio: number, out = new THREE.Color()): THREE.Color {
  if (ratio <= PASS_RATIO) return out.copy(CALM).lerp(TIGHT, Math.max(0, ratio / PASS_RATIO) ** 2);

  return out.copy(TIGHT).lerp(BREAKS, Math.min(1, (ratio - PASS_RATIO) / (FAIL_RATIO - PASS_RATIO)));
}

function fieldMesh(field: StressField): THREE.InstancedMesh {
  const [nx, ny] = field.n;
  const box = new THREE.BoxGeometry(field.h[0], field.h[1], field.h[2]);
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(box, material, field.cells.length);
  const at = new THREE.Matrix4();
  const color = new THREE.Color();

  field.cells.forEach((c, i) => {
    const ijk = [c % nx, Math.floor(c / nx) % ny, Math.floor(c / (nx * ny))];

    at.makeTranslation(
      ...([0, 1, 2].map((k) => field.origin[k] + (ijk[k] + 0.5) * field.h[k]) as [number, number, number]),
    );
    mesh.setMatrixAt(i, at);
    mesh.setColorAt(i, stressColor(field.ratio[i], color));
  });

  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};

  return mesh;
}

export class StressOverlay {
  private readonly group = new THREE.Group();

  private readonly ctx: ViewportContext;

  private entries: Array<{ id: string; mesh: THREE.InstancedMesh }> = [];

  private readonly stop: () => void;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.group.name = 'stress-field';
    ctx.stage.overlays.add(this.group);
    this.stop = onStressFields(() => this.sync());
  }

  sync(): void {
    this.clear();

    for (const id of shownStress()) {
      const field = stressFieldOf(id);

      if (!field) continue;

      const mesh = fieldMesh(field);

      this.group.add(mesh);
      this.entries.push({ id, mesh });
    }

    this.place();
    this.ctx.loop.invalidate();
  }

  place(): void {
    if (!this.entries.length) return;

    const objects = new Map(
      partObjects(
        this.ctx,
        this.entries.map((e) => e.id),
      ).map((o) => [o.id, o.object]),
    );
    const t = new THREE.Vector3();
    const q = new THREE.Quaternion();

    for (const { id, mesh } of this.entries) {
      const object = objects.get(id);

      mesh.visible = !!object;

      if (!object) continue;

      object.matrixWorld.decompose(t, q, new THREE.Vector3());
      mesh.matrix.compose(t, q, UNIT);
      mesh.matrixWorldNeedsUpdate = true;
    }
  }

  private clear(): void {
    for (const { mesh } of this.entries) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }

    this.entries = [];
  }

  dispose(): void {
    this.stop();
    this.clear();
    this.group.removeFromParent();
  }
}
