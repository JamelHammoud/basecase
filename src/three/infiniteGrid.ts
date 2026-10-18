import * as THREE from 'three';

export interface InfiniteGrid {
  mesh: THREE.Mesh;
  update: (camera: THREE.Camera, target: THREE.Vector3) => void;
}

const vertexShader = `
  uniform float uExtent;
  varying vec3 vWorld;
  void main() {
    // Plane geometry lies in XY; lay it on the floor and keep it centered under the camera
    vec3 pos = vec3(position.x, 0.0, position.y) * uExtent;
    pos.xz += cameraPosition.xz;
    vWorld = pos;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uAxisX;
  uniform vec3 uAxisZ;
  uniform float uFade;
  varying vec3 vWorld;

  // Line coverage (0..1) for a grid of the given cell size, faded by on-screen cell size
  float level(vec2 p, vec2 dp, float size, float strength) {
    float cellPx = size / max(dp.x, dp.y);
    float lod = smoothstep(5.0, 22.0, cellPx);
    if (lod <= 0.0) return 0.0;
    vec2 d = abs(fract(p / size - 0.5) - 0.5) * size / dp; // distance to nearest line, in pixels
    float line = 1.0 - clamp(min(d.x, d.y) - 0.4, 0.0, 1.0);
    return line * lod * strength;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 dp = max(fwidth(p), vec2(1e-4));

    float a = 0.0;
    a = max(a, level(p, dp, 1.0, 0.35));
    a = max(a, level(p, dp, 10.0, 0.6));
    a = max(a, level(p, dp, 100.0, 0.9));
    a = max(a, level(p, dp, 1000.0, 1.0));

    float dist = length(vWorld.xz - cameraPosition.xz);
    float fade = 1.0 - smoothstep(uFade * 0.3, uFade, dist);

    vec3 color = uColor;
    float alpha = a * 0.55;

    // Axes: X runs along z = 0 (red), Z runs along x = 0 (blue)
    float ax = 1.0 - clamp(abs(p.y) / dp.y - 0.5, 0.0, 1.0);
    float az = 1.0 - clamp(abs(p.x) / dp.x - 0.5, 0.0, 1.0);
    if (ax > 0.0) {
      color = mix(color, uAxisX, ax);
      alpha = max(alpha, ax * 0.55);
    }
    if (az > 0.0) {
      color = mix(color, uAxisZ, az);
      alpha = max(alpha, az * 0.55);
    }

    alpha *= fade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createInfiniteGrid(): InfiniteGrid {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uExtent: { value: 3000 },
      uFade: { value: 3000 },
      uColor: { value: new THREE.Color('#8f8f8f') },
      uAxisX: { value: new THREE.Color('#ef4444') },
      uAxisZ: { value: new THREE.Color('#3b82f6') },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), material);

  mesh.name = 'infinite-grid';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.raycast = () => {};

  return {
    mesh,
    update: (camera, target) => {
      const d = camera.position.distanceTo(target);
      const fade = Math.min(70000, Math.max(1200, d * 7));

      material.uniforms.uFade.value = fade;
      material.uniforms.uExtent.value = fade;
    },
  };
}
