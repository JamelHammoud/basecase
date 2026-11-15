import * as THREE from 'three';
import { ImportedWorldLayer, type ImportedWorldView } from '../three/viewport/importedWorld';
import type { LensRenderer, LensShot, Viewport } from './lensRender';

export class CapturedWorld {
  readonly visual: ImportedWorldLayer;

  private readonly colliders = new THREE.Group();

  private hash: string | null = null;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.visual = new ImportedWorldLayer(scene, renderer, () => {}, true);
    this.colliders.visible = false;
    scene.add(this.colliders);
  }

  async set(view: ImportedWorldView | null): Promise<void> {
    await this.visual.set(view);

    if (view?.hash !== this.hash) {
      this.clear();
      this.hash = view?.hash ?? null;

      for (const piece of view?.asset.pieces ?? []) {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute('position', new THREE.BufferAttribute(piece.positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(piece.indices, 1));
        this.colliders.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
      }
    }

    this.colliders.position.set(...(view?.position ?? [0, 0, 0]));
    this.colliders.updateMatrixWorld(true);
  }

  async prepare(scene: THREE.Scene, lens: LensRenderer, shot: LensShot, viewport?: Viewport): Promise<void> {
    await this.visual.prepare(scene, lens.place(shot, viewport), viewport);
  }

  labels<T>(capture: () => T): T {
    this.visual.group.visible = false;
    this.colliders.visible = true;

    try {
      return capture();
    } finally {
      this.visual.group.visible = true;
      this.colliders.visible = false;
    }
  }

  dispose(): void {
    this.clear();
    this.colliders.removeFromParent();
    this.visual.dispose();
  }

  private clear(): void {
    for (const child of [...this.colliders.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.removeFromParent();
    }
  }
}
