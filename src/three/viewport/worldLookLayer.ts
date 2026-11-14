import * as THREE from 'three';
import type { WorldLook, WorldLooks } from '../../sim/worldLooks';
import type { ScenePart } from '../../types/robotics';
import type { PartLayer } from './partLayer';

export interface ShownLook {
  visible: boolean;
  color: string | null;
}

export function shownLook(part: Pick<ScenePart, 'color'> | undefined, look: WorldLook | undefined): ShownLook {
  if (!look) return { visible: true, color: null };

  const own = look.color.toLowerCase() === part?.color?.toLowerCase();

  return { visible: look.visible, color: own ? null : look.color };
}

const ownColors = new WeakMap<THREE.Material, THREE.Color>();

const tintable = (material: THREE.Material): material is THREE.Material & { color: THREE.Color } =>
  (material as { color?: unknown }).color instanceof THREE.Color;

function meshMaterials(group: THREE.Object3D): THREE.Material[] {
  const found: THREE.Material[] = [];

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (mesh.isMesh) found.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  });

  return found;
}

function tint(material: THREE.Material & { color: THREE.Color }, color: THREE.Color | null): void {
  const own = ownColors.get(material);

  if (!color && own) material.color.copy(own);

  if (!color) return;

  if (!own) ownColors.set(material, material.color.clone());

  material.color.copy(color);
}

export function showLook(group: THREE.Object3D, look: ShownLook): void {
  const color = look.color ? new THREE.Color(look.color) : null;

  group.visible = look.visible;
  meshMaterials(group)
    .filter(tintable)
    .forEach((material) => tint(material, color));
}

export class WorldLookLayer {
  private looks: WorldLooks = {};

  private readonly layer: PartLayer;

  constructor(layer: PartLayer) {
    this.layer = layer;
  }

  set(looks: WorldLooks | null): void {
    this.looks = looks ?? {};
    this.apply();
  }

  apply(): void {
    for (const [id, group] of this.layer.objects()) {
      showLook(group, shownLook(this.layer.part(id), this.looks[id]));
    }
  }
}
