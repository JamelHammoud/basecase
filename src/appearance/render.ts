import { ownTextures } from './materialOwnership';
import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import type { Appearance } from './model';
import { acquireTexture } from './textures';

const PROJECTIONS = new Map([
  ['xy', 'position.xy / appearanceScale'],
  ['xz', 'position.xz / appearanceScale'],
  ['yz', 'position.yz / appearanceScale'],
]);

const scales = new WeakMap<THREE.Material, { value: number }>();

export function planarMaterial(material: THREE.MeshStandardMaterial, appearance: Appearance): void {
  const { mapping } = appearance;

  material.userData.appearance = appearance;

  const textured = [material.map, material.normalMap, material.roughnessMap, material.metalnessMap].some(Boolean);

  if (mapping.kind !== 'planar' || !textured) return;

  const scale = scales.get(material) ?? { value: mapping.scale };

  scale.value = mapping.scale;
  scales.set(material, scale);
  material.customProgramCacheKey = () => `appearance-planar-${mapping.plane}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.appearanceScale = scale;

    const projection = PROJECTIONS.get(mapping.plane) ?? PROJECTIONS.get('xy')!;
    const transforms = [
      ['USE_MAP', 'vMapUv', 'mapTransform'],
      ['USE_NORMALMAP', 'vNormalMapUv', 'normalMapTransform'],
      ['USE_ROUGHNESSMAP', 'vRoughnessMapUv', 'roughnessMapTransform'],
      ['USE_METALNESSMAP', 'vMetalnessMapUv', 'metalnessMapTransform'],
    ]
      .map(
        ([define, varying, transform]) =>
          `\n#ifdef ${define}\n${varying} = (${transform} * vec3(${projection}, 1.0)).xy;\n#endif`,
      )
      .join('');

    shader.vertexShader =
      'uniform float appearanceScale;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\n${transforms}`);
  };
}

function finishMaterial(
  source: THREE.MeshStandardMaterial,
  appearance: Appearance,
  supportsUv: boolean,
): THREE.MeshStandardMaterial {
  const material = source.clone();
  const releases: (() => void)[] = [];

  material.color.set(appearance.baseColor);
  material.roughness = appearance.roughness;
  material.metalness = appearance.metalness;
  material.opacity = appearance.opacity;
  material.vertexColors = false;
  material.map = null;
  material.normalMap = null;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.normalScale.set(1, appearance.normalY);

  const mappingSupported = appearance.mapping.kind === 'planar' || supportsUv;

  for (const [slot, hash] of Object.entries(appearance.textures ?? {})) {
    const owned = mappingSupported ? acquireTexture(hash, appearance, slot === 'baseColor') : null;

    if (!owned) continue;

    releases.push(owned.release);

    if (slot === 'baseColor') material.map = owned.texture;

    if (slot === 'normal') material.normalMap = owned.texture;

    if (slot === 'roughnessMetalness') {
      material.roughnessMap = owned.texture;
      material.metalnessMap = owned.texture;
    }
  }

  material.transparent = appearance.opacity < 1 || Boolean(material.map);
  material.depthWrite = !material.transparent;
  material.userData.appearanceMappingSupported = mappingSupported;
  ownTextures(material, releases);
  planarMaterial(material, appearance);

  return material;
}

export function applyAppearance(group: THREE.Object3D, part: Pick<ScenePart, 'appearance' | 'role' | 'kind'>): void {
  const { appearance } = part;

  if (!appearance || part.role !== 'solid' || part.kind === 'image_plane') return;

  const originals = new Set<THREE.Material>();

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    const supportsUv = Boolean(object.geometry.getAttribute('uv'));
    const replace = (material: THREE.Material) => {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.colorWrite) return material;

      originals.add(material);

      return finishMaterial(material, appearance, supportsUv);
    };

    object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
  });
  originals.forEach((material) => material.dispose());
}
