import * as THREE from 'three';

const SURFACE_VERTEX = `
varying vec3 vNormal;

void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const NORMAL_FRAGMENT = `
varying vec3 vNormal;

void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

const TOON_FRAGMENT = `
uniform vec3 color;
uniform float ghost;
varying vec3 vNormal;

void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  float d = dot(n, normalize(vec3(-0.38, 0.62, 0.69)));
  float band = mix(0.74, 0.88, smoothstep(-0.06, 0.06, d));
  band = mix(band, 1.0, smoothstep(0.42, 0.52, d));
  float rim = smoothstep(0.25, 0.0, n.z) * 0.05;
  vec3 lit = color * band + rim;
  float grey = dot(lit, vec3(0.299, 0.587, 0.114));
  vec3 faded = mix(vec3(grey), lit, 0.3);
  gl_FragColor = vec4(mix(lit, mix(faded, vec3(1.0), 0.6), ghost), 1.0);
}
`;

export const referenceNormal = () =>
  new THREE.ShaderMaterial({ vertexShader: SURFACE_VERTEX, fragmentShader: NORMAL_FRAGMENT, side: THREE.DoubleSide });

export const referenceToon = (source: THREE.ShaderMaterial) =>
  new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERTEX,
    fragmentShader: TOON_FRAGMENT,
    uniforms: source.uniforms,
    side: THREE.DoubleSide,
  });
