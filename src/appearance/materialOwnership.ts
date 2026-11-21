import type { Material } from 'three';

const ownership = new WeakMap<Material, Array<() => void>>();
const watched = new WeakSet<Material>();

function release(material: Material): void {
  ownership.get(material)?.forEach((dispose) => dispose());
  ownership.delete(material);
}

export function ownTextures(material: Material, releases: Array<() => void>): void {
  ownership.set(material, releases);

  if (watched.has(material)) return;

  watched.add(material);
  material.addEventListener('dispose', () => release(material));
}

export function moveTextureOwnership(source: Material, target: Material): void {
  release(target);

  const releases = ownership.get(source) ?? [];

  ownership.delete(source);
  ownTextures(target, releases);
}
