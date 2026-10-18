import * as THREE from 'three';

const PLANE_SIZE = 140;

export class BlueprintUnderlay {
  private mesh: THREE.Mesh | null = null;

  private url: string | null = null;

  private readonly scene: THREE.Scene;

  private readonly onLoad: () => void;

  constructor(scene: THREE.Scene, onLoad: () => void) {
    this.scene = scene;
    this.onLoad = onLoad;
  }

  set(url: string | null): void {
    if (url === this.url) {
      return;
    }

    this.url = url;

    if (this.mesh) this.scene.remove(this.mesh);

    this.mesh = null;

    if (url) new THREE.TextureLoader().load(url, (texture) => this.place(url, texture));
  }

  private place(url: string, texture: THREE.Texture): void {
    if (url !== this.url) {
      return;
    }

    texture.colorSpace = THREE.SRGBColorSpace;

    const image = texture.image as { width?: number; height?: number } | undefined;
    const aspect = (image?.width || 1) / Math.max(1, image?.height || 1);
    const width = PLANE_SIZE * Math.min(1, aspect);
    const depth = PLANE_SIZE * (aspect >= 1 ? 1 / aspect : 1);
    const geometry = new THREE.PlaneGeometry(width, depth);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.45, depthWrite: false }),
    );

    geometry.rotateX(-Math.PI / 2);
    mesh.position.y = 0.12;
    mesh.raycast = () => {};
    this.scene.add(mesh);
    this.mesh = mesh;
    this.onLoad();
  }
}
