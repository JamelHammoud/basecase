import * as THREE from 'three';
import { LensRenderer, type LensShot } from './lensRender';
import { labelMaterial, labelMaterialKey } from './labelMaterials';
import { decodeDepthPixels, decodeInstancePixels, type LabelInstance } from './labelPixels';

interface Saved {
  object: THREE.Object3D;
  visible: boolean;
  material?: THREE.Material | THREE.Material[];
}

export class LabelRenderer {
  private readonly materials = new Map<string, THREE.ShaderMaterial>();

  private readonly target: THREE.WebGLRenderTarget;

  private readonly pixels: Uint8Array;

  private readonly renderer: THREE.WebGLRenderer;

  readonly width: number;

  readonly height: number;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      samples: 0,
      depthBuffer: true,
    });
    this.pixels = new Uint8Array(width * height * 4);
  }

  draw(scene: THREE.Scene, lens: LensRenderer, shot: LensShot, instances: LabelInstance[]) {
    const byPart = new Map(
      instances.flatMap((instance) => (instance.partIds ?? [instance.partId]).map((id) => [id, instance.id] as const)),
    );
    const saved = this.replace(scene, byPart);
    const previous = this.renderer.getRenderTarget();
    const clearColor = this.renderer.getClearColor(new THREE.Color());
    const clearAlpha = this.renderer.getClearAlpha();
    const background = scene.background;

    scene.background = null;
    this.renderer.setClearColor(0, 1);
    this.renderer.setRenderTarget(this.target);

    try {
      this.pass(scene, lens, shot, false);

      const raster = decodeInstancePixels(this.pixels, this.width, this.height);

      this.pass(scene, lens, shot, true);

      return { raster, depth: decodeDepthPixels(this.pixels, this.width, this.height) };
    } finally {
      for (const item of saved) {
        item.object.visible = item.visible;

        if (item.material) (item.object as THREE.Mesh).material = item.material;
      }

      scene.background = background;
      this.renderer.setRenderTarget(previous);
      this.renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.target.dispose();
  }

  private replace(scene: THREE.Scene, byPart: Map<string, number>): Saved[] {
    const saved: Saved[] = [];
    const used = new Set<string>();

    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if ((object as THREE.Line).isLine) {
        saved.push({ object, visible: object.visible });
        object.visible = false;
      }

      if (!mesh.isMesh) return;

      const id = byPart.get(String(object.userData.partId)) ?? 0;
      const replaceMaterial = (original: THREE.Material) => {
        const key = labelMaterialKey(id, original);
        const material = this.materials.get(key) ?? labelMaterial(id, original);

        used.add(key);
        this.materials.set(key, material);

        return material;
      };

      saved.push({ object, material: mesh.material, visible: object.visible });
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(replaceMaterial)
        : replaceMaterial(mesh.material);
    });

    for (const [key, material] of this.materials) {
      if (used.has(key)) continue;

      material.dispose();
      this.materials.delete(key);
    }

    return saved;
  }

  private pass(scene: THREE.Scene, lens: LensRenderer, shot: LensShot, depth: boolean): void {
    for (const material of this.materials.values()) {
      material.uniforms.origin.value.set(...shot.position);
      material.uniforms.depthPass.value = depth;
    }

    lens.render(scene, shot, { width: this.width, height: this.height }, true);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, this.width, this.height, this.pixels);
  }
}
