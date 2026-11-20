import * as THREE from 'three';

export interface BuildTooling {
  normals: Float32Array;
  positions: Float32Array;
  matrix: number[];
}

export class BuildToolingLayer {
  private readonly root = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.8 });

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
  }

  show(tooling?: BuildTooling): void {
    this.root.children.forEach((object) => (object as THREE.Mesh).geometry.dispose());
    this.root.clear();

    if (!tooling) return;

    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(tooling.positions, 3),
    );

    geometry.setAttribute('normal', new THREE.BufferAttribute(tooling.normals, 3));

    const mesh = new THREE.Mesh(geometry, this.material);

    mesh.matrixAutoUpdate = false;
    mesh.matrix.fromArray(tooling.matrix);
    this.root.add(mesh);
  }

  dispose(): void {
    this.show();
    this.root.removeFromParent();
    this.material.dispose();
  }
}
