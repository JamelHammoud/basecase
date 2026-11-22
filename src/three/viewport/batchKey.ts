import * as THREE from 'three';

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'lightMap',
  'bumpMap',
  'displacementMap',
  'envMap',
] as const;

const hasTexture = (material: THREE.MeshStandardMaterial) => TEXTURE_SLOTS.some((slot) => material[slot]);

const glows = (material: THREE.MeshStandardMaterial) =>
  material.emissiveIntensity > 0 && material.emissive.getHex() !== 0;

const drawsPlainly = (material: THREE.MeshStandardMaterial) =>
  material.visible &&
  material.colorWrite &&
  !material.transparent &&
  material.opacity === 1 &&
  !material.wireframe &&
  !material.vertexColors &&
  material.alphaTest === 0 &&
  !material.clippingPlanes?.length;

export const MAX_BATCHED_VERTICES = 32_768;

const plainGeometry = (geometry: THREE.BufferGeometry) =>
  Boolean(geometry.getAttribute('position') && geometry.getAttribute('normal')) &&
  geometry.getAttribute('position').count <= MAX_BATCHED_VERTICES &&
  !Object.keys(geometry.morphAttributes).length &&
  geometry.drawRange.start === 0 &&
  geometry.drawRange.count === Infinity;

const plainObject = (mesh: THREE.Mesh) =>
  mesh.isMesh &&
  !(mesh as THREE.Mesh & { isBatchedMesh?: boolean }).isBatchedMesh &&
  !(mesh as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh &&
  !(mesh as THREE.Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh &&
  mesh.renderOrder === 0 &&
  !Array.isArray(mesh.material);

export function batchMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
  if (!plainObject(mesh) || !plainGeometry(mesh.geometry)) return null;

  const material = mesh.material as THREE.Material;

  if (!(material instanceof THREE.MeshStandardMaterial) || material instanceof THREE.MeshPhysicalMaterial) return null;

  return drawsPlainly(material) && !hasTexture(material) && !glows(material) ? material : null;
}

type AnyAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

const attributeKey = (attribute: AnyAttribute) =>
  `${attribute.array.constructor.name}${attribute.itemSize}${attribute.normalized ? 'n' : ''}`;

const versionOf = (attribute: AnyAttribute) =>
  attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;

export function batchKey(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial): string {
  return [
    material.roughness,
    material.metalness,
    material.envMapIntensity,
    material.flatShading,
    material.side,
    material.depthTest,
    material.depthWrite,
    material.polygonOffset ? `${material.polygonOffsetFactor},${material.polygonOffsetUnits}` : 'flat',
    material.toneMapped,
    material.fog,
    mesh.castShadow,
    mesh.receiveShadow,
    attributeKey(mesh.geometry.getAttribute('position')),
    attributeKey(mesh.geometry.getAttribute('normal')),
    mesh.geometry.getIndex() ? 'indexed' : 'soup',
  ].join('|');
}

export function batchedMaterialFrom(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const batched = material.clone();

  batched.color.setRGB(1, 1, 1);
  batched.name = 'batched';

  return batched;
}

export function batchView(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const view = new THREE.BufferGeometry()
    .setAttribute('position', geometry.getAttribute('position'))
    .setAttribute('normal', geometry.getAttribute('normal'));

  if (geometry.index) view.setIndex(geometry.index);

  view.boundingBox = geometry.boundingBox;
  view.boundingSphere = geometry.boundingSphere;

  return view;
}

export function geometryVersion(geometry: THREE.BufferGeometry): string {
  return `${versionOf(geometry.getAttribute('position'))}:${versionOf(geometry.getAttribute('normal'))}:${geometry.index?.version ?? 0}`;
}

const plainLines = (lines: THREE.LineSegments) =>
  lines.isLineSegments &&
  !(lines as THREE.LineSegments & { isLineSegments2?: boolean }).isLineSegments2 &&
  lines.renderOrder === 0 &&
  !Array.isArray(lines.material) &&
  !lines.geometry.index &&
  lines.geometry.getAttribute('position')?.itemSize === 3 &&
  !Object.keys(lines.geometry.morphAttributes).length &&
  lines.geometry.drawRange.start === 0 &&
  lines.geometry.drawRange.count === Infinity;

export function lineMaterial(lines: THREE.LineSegments): THREE.LineBasicMaterial | null {
  if (!plainLines(lines)) return null;

  const material = lines.material as THREE.Material;
  const plain =
    material instanceof THREE.LineBasicMaterial &&
    material.type === 'LineBasicMaterial' &&
    material.visible &&
    material.colorWrite &&
    !material.vertexColors &&
    !material.map &&
    !material.clippingPlanes?.length;

  return plain ? (material as THREE.LineBasicMaterial) : null;
}

export function lineKey(material: THREE.LineBasicMaterial): string {
  return [
    material.color.getHexString(),
    material.opacity,
    material.transparent,
    material.depthTest,
    material.depthWrite,
    material.toneMapped,
    material.fog,
    material.blending,
  ].join('|');
}
