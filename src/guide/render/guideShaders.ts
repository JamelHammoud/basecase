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

const ID_FRAGMENT = `
uniform vec3 idColor;

void main() {
  gl_FragColor = vec4(idColor, 1.0);
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

const COMPOSITE_VERTEX = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMPOSITE_FRAGMENT = `
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tId;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float depthEdge;
varying vec2 vUv;

const vec3 INK = vec3(0.07);
const vec3 GHOST_INK = vec3(0.6);
const vec3 SOFT_INK = vec3(0.72);
const vec3 DARK_PART_INK = vec3(0.56);

float viewZ(vec2 uv) {
  return near + texture2D(tDepth, uv).x * (far - near);
}

float idOf(vec4 c) {
  return floor(c.r * 255.0 + 0.5) + floor(c.g * 255.0 + 0.5) * 256.0;
}

bool isNew(vec4 c) {
  return c.b > 0.75;
}

vec3 inkFor(vec4 nearId, vec2 nearUv, bool outline) {
  if (!isNew(nearId)) return outline ? GHOST_INK : SOFT_INK;

  float fill = dot(texture2D(tColor, nearUv).rgb, vec3(0.299, 0.587, 0.114));

  return (!outline && fill < 0.3) ? DARK_PART_INK : INK;
}

void main() {
  vec4 here = texture2D(tId, vUv);
  bool empty = here.a < 0.5;
  float id = idOf(here);
  vec3 n = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  float z = viewZ(vUv);
  float ink = 0.0;
  vec3 inkColor = INK;

  for (int r = 1; r <= 2; r++) {
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.78539816;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * texel * float(r);
      vec4 there = texture2D(tId, uv);
      bool none = there.a < 0.5;

      if (empty && none) continue;

      float strength = 0.0;
      bool outline = empty != none;

      if (outline) {
        strength = 1.0;
      } else if (r == 1 && idOf(there) != id) {
        strength = 0.85;
      } else if (r == 1) {
        vec3 m = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
        float crease = smoothstep(0.82, 0.62, dot(n, m));
        float jump = smoothstep(depthEdge, depthEdge * 2.0, abs(viewZ(uv) - z));
        strength = max(crease * 0.8, jump * 0.9);
      }

      if (strength <= ink) continue;

      bool hereNearer = !empty && (none || z <= viewZ(uv));

      ink = strength;
      inkColor = hereNearer ? inkFor(here, vUv, outline) : inkFor(there, uv, outline);
    }
  }

  vec3 base = empty ? vec3(1.0) : texture2D(tColor, vUv).rgb;
  float alpha = empty ? ink : 1.0;
  vec3 rgb = empty ? inkColor : mix(base, inkColor, ink);

  gl_FragColor = vec4(rgb * alpha, alpha);
}
`;

export const normalMaterial = () =>
  new THREE.ShaderMaterial({ vertexShader: SURFACE_VERTEX, fragmentShader: NORMAL_FRAGMENT, side: THREE.DoubleSide });

export const idMaterial = () =>
  new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERTEX,
    fragmentShader: ID_FRAGMENT,
    uniforms: { idColor: { value: new THREE.Vector3() } },
    side: THREE.DoubleSide,
  });

export const toonMaterial = () =>
  new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERTEX,
    fragmentShader: TOON_FRAGMENT,
    uniforms: { color: { value: new THREE.Vector3(1, 1, 1) }, ghost: { value: 0 } },
    side: THREE.DoubleSide,
  });

export const compositeMaterial = () =>
  new THREE.ShaderMaterial({
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: {
      tColor: { value: null },
      tNormal: { value: null },
      tId: { value: null },
      tDepth: { value: null },
      texel: { value: new THREE.Vector2() },
      near: { value: 1 },
      far: { value: 1000 },
      depthEdge: { value: 2 },
    },
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });
