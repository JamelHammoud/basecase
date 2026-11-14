import * as THREE from 'three';

type SurfaceMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;

interface Surface {
  material: SurfaceMaterial;
  map: THREE.DataTexture;
  pixels: Uint8Array;
}

function surface(original: SurfaceMaterial): Surface {
  const material = original.clone();
  const pixels = new Uint8Array(8 * 8 * 4);
  const map = new THREE.DataTexture(pixels, 8, 8);

  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 4);
  map.colorSpace = THREE.SRGBColorSpace;
  material.map = map;

  return { material, map, pixels };
}

export class TrainingSurfaces {
  private readonly cache = new Map<SurfaceMaterial, Surface>();

  apply(root: THREE.Object3D, random: () => number, amount: number): () => void {
    const restores: Array<() => void> = [];

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const original = child.material;
      const materials = Array.isArray(original) ? original : [original];
      const varied = materials.map((material) => this.material(material, random, amount));

      child.material = Array.isArray(original) ? varied : varied[0];
      restores.push(() => {
        child.material = original;
      });
    });

    return () => restores.forEach((restore) => restore());
  }

  dispose(): void {
    this.cache.forEach((entry) => {
      entry.material.dispose();
      entry.map.dispose();
    });
    this.cache.clear();
  }

  private material(original: THREE.Material, random: () => number, amount: number): THREE.Material {
    if (!(original instanceof THREE.MeshStandardMaterial) && !(original instanceof THREE.MeshBasicMaterial))
      return original;

    let entry = this.cache.get(original);

    if (!entry) {
      entry = surface(original);
      this.cache.set(original, entry);
    }

    const pixels = entry.pixels;

    for (let i = 0; i < pixels.length; i += 4) {
      const value = Math.round(255 * (1 - random() * amount * 0.5));

      pixels.set([value, value, value, 255], i);
    }

    entry.map.needsUpdate = true;

    return entry.material;
  }
}
