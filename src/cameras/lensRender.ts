import * as THREE from 'three';
import { verticalDeg, type Lens } from './lens';
import type { V3 } from '../utils/kinematics';

const NEAR_MM = 5;
const FAR_MM = 40000;
const MIN_FACE = 128;
const MAX_FACE = 1024;

export interface LensShot {
  position: V3;
  target: V3;
  up: V3;
  lens: Lens;
}

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = `
uniform samplerCube cube;
uniform mat3 basis;
uniform float halfFov;
uniform float aspect;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.y /= aspect;
  float rho = length(p);
  if (rho > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float theta = rho * halfFov;
  vec2 side = rho > 0.0 ? p / rho : vec2(0.0);
  vec3 local = vec3(side * sin(theta), -cos(theta));
  gl_FragColor = vec4(textureCube(cube, basis * local).rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function fisheyeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      cube: { value: null },
      basis: { value: new THREE.Matrix3() },
      halfFov: { value: 1 },
      aspect: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });
}

const FACE_HALF_DIAGONAL_DEG = 54.74;

export const faceSizeFor = (width: number, fovDeg: number) =>
  Math.min(MAX_FACE, Math.max(MIN_FACE, Math.round(((width * 90) / fovDeg) * 1.15)));

export function faceSeen(forward: THREE.Vector3, face: THREE.Vector3, fovDeg: number): boolean {
  const reach = Math.cos(THREE.MathUtils.degToRad(Math.min(180, fovDeg / 2 + FACE_HALF_DIAGONAL_DEG + 1)));

  return forward.dot(face) >= reach;
}

interface Cube {
  target: THREE.WebGLCubeRenderTarget;
  camera: THREE.CubeCamera;
}

export interface Viewport {
  width: number;
  height: number;
}

export class LensRenderer {
  readonly camera = new THREE.PerspectiveCamera(60, 4 / 3, NEAR_MM, FAR_MM);

  private readonly quadScene = new THREE.Scene();

  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly material = fisheyeMaterial();

  private readonly cubes = new Map<number, Cube>();

  private readonly forward = new THREE.Vector3();

  private readonly faceDir = new THREE.Vector3();

  private readonly renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  render(scene: THREE.Scene, shot: LensShot, viewport?: Viewport): void {
    const full = this.renderer.getSize(new THREE.Vector2());
    const size = viewport ?? { width: full.x, height: full.y };
    const aspect = size.width / Math.max(1, size.height);

    this.camera.position.set(...shot.position);
    this.camera.up.set(...shot.up);
    this.camera.lookAt(...shot.target);
    this.camera.aspect = aspect;
    this.camera.fov = verticalDeg(shot.lens, aspect);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    if (shot.lens.model === 'fisheye') this.renderFaces(scene, shot.lens.fovDeg, size.width);

    this.renderer.setViewport(0, 0, size.width, size.height);
    this.renderer.setScissor(0, 0, size.width, size.height);
    this.renderer.setScissorTest(Boolean(viewport));

    if (shot.lens.model === 'pinhole') this.renderer.render(scene, this.camera);
    else this.renderer.render(this.quadScene, this.quadCamera);

    this.renderer.setScissorTest(false);
  }

  warm(scene: THREE.Scene): Promise<unknown> {
    return Promise.all([
      this.renderer.compileAsync(scene, this.camera),
      this.renderer.compileAsync(this.quadScene, this.quadCamera),
    ]);
  }

  dispose(): void {
    this.cubes.forEach((c) => c.target.dispose());
    this.cubes.clear();
    this.material.dispose();
    (this.quadScene.children[0] as THREE.Mesh).geometry.dispose();
  }

  private cube(face: number): Cube {
    const known = this.cubes.get(face);

    if (known) return known;

    const target = new THREE.WebGLCubeRenderTarget(face, { type: THREE.HalfFloatType });
    const camera = new THREE.CubeCamera(NEAR_MM, FAR_MM, target);

    camera.coordinateSystem = this.renderer.coordinateSystem;
    camera.updateCoordinateSystem();
    this.cubes.set(face, { target, camera });

    return { target, camera };
  }

  private renderFaces(scene: THREE.Scene, fovDeg: number, width: number): void {
    const { target, camera } = this.cube(faceSizeFor(width, fovDeg));
    const previous = this.renderer.getRenderTarget();
    const forward = this.camera.getWorldDirection(this.forward);
    const faces = camera.children as THREE.PerspectiveCamera[];
    const uniforms = this.material.uniforms;

    camera.position.copy(this.camera.position);
    camera.updateMatrixWorld(true);
    faces.forEach((face, i) => {
      if (!faceSeen(forward, face.getWorldDirection(this.faceDir), fovDeg)) return;

      this.renderer.setRenderTarget(target, i);
      this.renderer.render(scene, face);
    });
    this.renderer.setRenderTarget(previous);
    uniforms.cube.value = target.texture;
    uniforms.basis.value.setFromMatrix4(this.camera.matrixWorld);
    uniforms.halfFov.value = THREE.MathUtils.degToRad(fovDeg) / 2;
    uniforms.aspect.value = this.camera.aspect;
  }
}
