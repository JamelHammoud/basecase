import * as THREE from 'three';
import type { WorldMaterial, WorldMesh } from '../../cases/worldImportTypes';

const TEXTURE_WRAP = {
  repeat: THREE.RepeatWrapping,
  clamp: THREE.ClampToEdgeWrapping,
  mirror: THREE.MirroredRepeatWrapping,
} as const;

export interface WorldMeshVisual {
  object: THREE.Mesh;
  ready: Promise<void>;
  dispose: () => void;
}

function worldMaterial(source: WorldMaterial, vertexColors: boolean): THREE.MeshStandardMaterial {
  const [r, g, b, opacity] = source.color;

  return new THREE.MeshStandardMaterial({
    name: source.name,
    color: new THREE.Color(r, g, b),
    opacity,
    transparent: opacity < 1,
    roughness: source.roughness,
    metalness: source.metalness,
    side: source.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors,
  });
}

export function createWorldMesh(source: WorldMesh): WorldMeshVisual {
  const geometry = new THREE.BufferGeometry();
  const materials = source.materials.map((material) => worldMaterial(material, Boolean(source.colors)));
  const textures: THREE.Texture[] = [];
  const bitmaps: ImageBitmap[] = [];
  let disposed = false;

  geometry.setAttribute('position', new THREE.BufferAttribute(source.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(source.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));

  if (source.colors) geometry.setAttribute('color', new THREE.BufferAttribute(source.colors, 3));

  if (source.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(source.uvs, 2));

  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.material);

  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(...source.bounds.min),
    new THREE.Vector3(...source.bounds.max),
  );
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());

  const object = new THREE.Mesh(geometry, materials);

  object.name = 'imported-world-mesh';
  object.receiveShadow = true;
  object.raycast = () => {};

  const ready = Promise.all(
    source.materials.map(async (material, index) => {
      if (!material.image) return;

      const { bytes, mimeType } = material.image;
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mimeType }), {
        imageOrientation: material.image.flipY ? 'flipY' : 'none',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });

      if (disposed) {
        bitmap.close();

        return;
      }

      const texture = new THREE.Texture(bitmap);

      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = TEXTURE_WRAP[material.image.wrapS ?? 'repeat'];
      texture.wrapT = TEXTURE_WRAP[material.image.wrapT ?? 'repeat'];
      texture.needsUpdate = true;
      materials[index].map = texture;
      materials[index].needsUpdate = true;
      textures.push(texture);
      bitmaps.push(bitmap);
    }),
  ).then(() => {});

  return {
    object,
    ready,
    dispose: () => {
      if (disposed) return;

      disposed = true;
      object.removeFromParent();
      geometry.dispose();
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      bitmaps.forEach((bitmap) => bitmap.close());
    },
  };
}
