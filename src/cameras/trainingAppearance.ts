import * as THREE from 'three';
import type { ImageAppearance, ImageSurface } from '../vision/imageAppearance';

interface Replaced {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  material: THREE.MeshStandardMaterial;
}

const textureValue = (surface: ImageSurface, x: number, y: number) => {
  const dark = surface.texture === 'checker' ? (Math.floor(x / 16) + Math.floor(y / 16)) % 2 : x < 16;

  return dark ? 180 : 255;
};

function surfaceTexture(surface: ImageSurface): THREE.DataTexture | null {
  if (!surface.texture || surface.texture === 'plain') return null;

  const size = 32;
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = textureValue(surface, x, y);
      const offset = (y * size + x) * 4;

      pixels.set([value, value, value, 255], offset);
    }
  }

  const texture = new THREE.DataTexture(pixels, size, size);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

export class TrainingAppearance {
  private replaced: Replaced[] = [];

  private textures: THREE.Texture[] = [];

  private light: {
    key: THREE.DirectionalLight;
    position: THREE.Vector3;
    color: THREE.Color;
    intensity: number;
  } | null = null;

  apply(scene: THREE.Scene, floor: THREE.Mesh, appearance: ImageAppearance): void {
    this.clear();

    const key = scene.children.find(
      (item) => (item as THREE.DirectionalLight).isDirectionalLight,
    ) as THREE.DirectionalLight;

    this.light = { key, position: key.position.clone(), color: key.color.clone(), intensity: key.intensity };
    key.position.set(...appearance.light.direction).multiplyScalar(1000);
    key.color.set(appearance.light.color);
    key.intensity = appearance.light.intensity;
    this.surface(floor, appearance.floor);

    const walls = new Set(appearance.wallPartIds);

    scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && walls.has(String(object.userData.partId)))
        this.surface(object as THREE.Mesh, appearance.wall);
    });
  }

  clear(): void {
    const light = this.light;

    if (light) {
      light.key.position.copy(light.position);
      light.key.color.copy(light.color);
      light.key.intensity = light.intensity;
      this.light = null;
    }

    for (const item of this.replaced) {
      item.mesh.material = item.original;
      item.material.dispose();
    }

    this.textures.forEach((texture) => texture.dispose());
    this.replaced = [];
    this.textures = [];
  }

  private surface(mesh: THREE.Mesh, surface: ImageSurface): void {
    const texture = surfaceTexture(surface);
    const material = new THREE.MeshStandardMaterial({ color: surface.color, roughness: 0.95, map: texture });

    mesh.geometry.computeBoundingBox();

    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    const sides = [size.x, size.y, size.z].sort((a, b) => b - a);

    if (texture) {
      texture.repeat.set(sides[0] / (surface.scaleMm ?? 100), sides[1] / (surface.scaleMm ?? 100));
      this.textures.push(texture);
    }

    this.replaced.push({ mesh, original: mesh.material, material });
    mesh.material = material;
  }
}
