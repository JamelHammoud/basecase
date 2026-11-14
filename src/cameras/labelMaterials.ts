import * as THREE from 'three';

const VERTEX = `
uniform mat3 mapTransform;
uniform mat3 alphaTransform;
varying vec3 worldPoint;
varying vec2 colorUv;
varying vec2 alphaUv;
void main() {
  vec4 placed = modelMatrix * vec4(position, 1.0);
  worldPoint = placed.xyz;
  colorUv = (mapTransform * vec3(uv, 1.0)).xy;
  alphaUv = (alphaTransform * vec3(uv, 1.0)).xy;
  gl_Position = projectionMatrix * viewMatrix * placed;
}
`;

const FRAGMENT = `
uniform vec3 code;
uniform vec3 origin;
uniform bool depthPass;
uniform bool hasMap;
uniform bool hasAlphaMap;
uniform sampler2D colorMap;
uniform sampler2D alphaMap;
uniform float opacity;
uniform float cutoff;
varying vec3 worldPoint;
varying vec2 colorUv;
varying vec2 alphaUv;
void main() {
  float alpha = opacity;
  if (hasMap) alpha *= texture2D(colorMap, colorUv).a;
  if (hasAlphaMap) alpha *= texture2D(alphaMap, alphaUv).g;
  if (alpha < max(cutoff, 0.00001)) discard;
  float value = floor(length(worldPoint - origin) * 100.0 + 0.5);
  vec3 packed = vec3(mod(value, 256.0), mod(floor(value / 256.0), 256.0), floor(value / 65536.0));
  gl_FragColor = vec4(depthPass ? packed / 255.0 : code, 1.0);
}
`;

type Surface = THREE.Material & { map?: THREE.Texture | null; alphaMap?: THREE.Texture | null };

const colorCode = (id: number) =>
  new THREE.Vector3(id % 256, Math.floor(id / 256) % 256, Math.floor(id / 65536)).divideScalar(255);

const textureMatrix = (texture?: THREE.Texture | null) => {
  if (texture?.matrixAutoUpdate) texture.updateMatrix();

  return texture?.matrix ?? new THREE.Matrix3();
};

export const labelMaterialKey = (id: number, original: Surface): string =>
  [
    id,
    original.side,
    original.visible,
    original.colorWrite,
    original.depthWrite,
    original.alphaTest,
    original.opacity,
    original.transparent,
    original.map?.uuid,
    original.alphaMap?.uuid,
  ].join(':');

export function labelMaterial(id: number, original: Surface): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      code: { value: colorCode(original.colorWrite ? id : 0) },
      origin: { value: new THREE.Vector3() },
      depthPass: { value: false },
      colorMap: { value: original.map ?? null },
      alphaMap: { value: original.alphaMap ?? null },
      mapTransform: { value: textureMatrix(original.map) },
      alphaTransform: { value: textureMatrix(original.alphaMap) },
      hasMap: { value: Boolean(original.map) && (original.transparent || original.alphaTest > 0) },
      hasAlphaMap: { value: Boolean(original.alphaMap) && (original.transparent || original.alphaTest > 0) },
      opacity: { value: original.transparent || original.alphaTest ? original.opacity : 1 },
      cutoff: { value: original.alphaTest },
    },
    toneMapped: false,
    blending: THREE.NoBlending,
    side: original.side,
    visible: original.visible && (original.colorWrite || original.depthWrite),
  });

  return material;
}
