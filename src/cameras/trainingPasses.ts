import * as THREE from 'three';
import type { Posed } from '../datasets/renderVideos';
import { LensRenderer, type LensShot } from './lensRender';
import { decodeTrainingPixels, trainingInstances } from './trainingLabels';

const VERTEX = `
varying vec3 worldPoint;
varying vec2 meshUv;
void main() {
  meshUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  worldPoint = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = `
uniform vec3 label;
uniform vec3 origin;
uniform bool distancePass;
uniform sampler2D colorMap;
uniform sampler2D alphaMap;
uniform mat3 colorTransform;
uniform mat3 alphaTransform;
uniform bool hasColorMap;
uniform bool hasAlphaMap;
uniform float opacity;
uniform float alphaCutoff;
varying vec3 worldPoint;
varying vec2 meshUv;
void main() {
  float coverage = opacity;
  if (hasColorMap) coverage *= texture2D(colorMap, (colorTransform * vec3(meshUv, 1.0)).xy).a;
  if (hasAlphaMap) coverage *= texture2D(alphaMap, (alphaTransform * vec3(meshUv, 1.0)).xy).g;
  if (coverage < alphaCutoff) discard;
  vec4 encoded = vec4(label, 255.0);
  if (distancePass) {
    uint value = floatBitsToUint(length(worldPoint - origin));
    uvec4 bytes = uvec4(value >> 24u, value >> 16u, value >> 8u, value) & uvec4(255u);
    encoded = vec4(bytes);
  }
  gl_FragColor = encoded / 255.0;
}
`;

const encodedId = (id: number) => new THREE.Vector3((id >>> 16) & 255, (id >>> 8) & 255, id & 255);

function labelMaterial(id: number, origin: THREE.Vector3, original: THREE.Material): THREE.ShaderMaterial {
  const textured = original as THREE.MeshBasicMaterial;
  const map = textured.map;
  const alphaMap = textured.alphaMap;

  map?.updateMatrix();
  alphaMap?.updateMatrix();

  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      label: { value: encodedId(id) },
      origin: { value: origin },
      distancePass: { value: false },
      colorMap: { value: map ?? null },
      alphaMap: { value: alphaMap ?? null },
      colorTransform: { value: map?.matrix ?? new THREE.Matrix3() },
      alphaTransform: { value: alphaMap?.matrix ?? new THREE.Matrix3() },
      hasColorMap: { value: Boolean(map) },
      hasAlphaMap: { value: Boolean(alphaMap) },
      opacity: { value: original.opacity },
      alphaCutoff: { value: Math.max(original.alphaTest, original.transparent ? 1e-7 : 0) },
    },
    toneMapped: false,
    blending: THREE.NoBlending,
    side: original.side,
    visible: original.visible && original.opacity > 0,
  });
}

interface LabelPass {
  isolate?: string;
  shot: LensShot;
  items: Posed[];
  width: number;
  height: number;
}

type LabelMaterial = (id: number, original: THREE.Material) => THREE.ShaderMaterial;

function overrideLabels(scene: THREE.Scene, materialFor: LabelMaterial, ids: Map<string, number>, isolate?: string) {
  const restores: Array<() => void> = [];

  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const material = child.material;
      const visible = child.visible;

      child.visible = visible && (!isolate || child.userData.partId === isolate);

      const id = ids.get(String(child.userData.partId)) ?? 0;

      child.material = Array.isArray(material)
        ? material.map((original) => materialFor(id, original))
        : materialFor(id, material);
      restores.push(() => {
        child.material = material;
        child.visible = visible;
      });

      return;
    }

    if (!(child instanceof THREE.Line) && !(child instanceof THREE.Points) && !(child instanceof THREE.Sprite)) return;

    const visible = child.visible;

    child.visible = false;
    restores.push(() => {
      child.visible = visible;
    });
  });

  return () => restores.forEach((restore) => restore());
}

export class TrainingPasses {
  private readonly materials = new Map<string, THREE.ShaderMaterial>();

  private readonly origin = new THREE.Vector3();

  private target: THREE.WebGLRenderTarget | null = null;

  private readonly renderer: THREE.WebGLRenderer;

  private readonly scene: THREE.Scene;

  private readonly lens: LensRenderer;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, lens: LensRenderer) {
    this.renderer = renderer;
    this.scene = scene;
    this.lens = lens;
  }

  capture(job: LabelPass) {
    const { renderer, scene, lens } = this;
    const { shot, width, height } = job;
    const instances = trainingInstances(job.items);
    const ids = new Map(instances.map((entry) => [entry.instance, entry.id]));
    const target = this.renderTarget(width, height);
    const previous = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    const background = scene.background;
    const gl = renderer.getContext();
    const dithering = gl.isEnabled(gl.DITHER);
    const restore = overrideLabels(scene, (id, original) => this.material(id, original), ids, job.isolate);
    const pixels = new Uint8Array(width * height * 4);
    const distances = new Uint8Array(pixels.length);

    this.origin.set(...shot.position);
    this.materials.forEach((material) => {
      material.uniforms.distancePass.value = false;
    });

    try {
      scene.background = null;
      gl.disable(gl.DITHER);
      renderer.setClearColor(0, 1);
      renderer.setRenderTarget(target);
      lens.render(scene, shot, { width, height }, true);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      this.materials.forEach((material) => {
        material.uniforms.distancePass.value = true;
      });
      renderer.setClearColor(0, 0);
      lens.render(scene, shot, { width, height }, true);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, distances);

      return { ...decodeTrainingPixels({ width, height, ids: pixels, distances }), instances };
    } finally {
      restore();

      if (dithering) gl.enable(gl.DITHER);

      scene.background = background;
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
    }
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.target?.dispose();
  }

  private material(id: number, original: THREE.Material): THREE.ShaderMaterial {
    const textured = original as THREE.MeshBasicMaterial;
    const key = [
      id,
      original.side,
      original.visible,
      original.opacity,
      original.transparent,
      original.alphaTest,
      textured.map?.uuid,
      textured.alphaMap?.uuid,
    ].join(':');
    const known = this.materials.get(key);

    if (known) return known;

    const material = labelMaterial(id, this.origin, original);

    this.materials.set(key, material);

    return material;
  }

  private renderTarget(width: number, height: number): THREE.WebGLRenderTarget {
    if (this.target?.width === width && this.target.height === height) return this.target;

    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      samples: 0,
    });

    return this.target;
  }
}
