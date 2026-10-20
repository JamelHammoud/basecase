import * as THREE from 'three';
import { compositeMaterial, normalMaterial } from './guideShaders';

export const SUPERSAMPLE = 2;

export interface StagePart {
  group: THREE.Group;
  meshes: Array<{ mesh: THREE.Mesh; toon: THREE.ShaderMaterial }>;
  idMaterial: THREE.ShaderMaterial;
  index: number;
}

interface Targets {
  width: number;
  height: number;
  normal: THREE.WebGLRenderTarget;
  id: THREE.WebGLRenderTarget;
  color: THREE.WebGLRenderTarget;
}

const target = (width: number, height: number, depthTexture?: THREE.DepthTexture) =>
  new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    ...(depthTexture ? { depthTexture } : {}),
  });

function makeTargets(width: number, height: number): Targets {
  const depth = new THREE.DepthTexture(width, height, THREE.FloatType);

  return {
    width,
    height,
    normal: target(width, height, depth),
    id: target(width, height),
    color: target(width, height),
  };
}

function disposeTargets(t: Targets | null) {
  t?.normal.depthTexture?.dispose();
  t?.normal.dispose();
  t?.id.dispose();
  t?.color.dispose();
}

export class GuideStage {
  readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly normal = normalMaterial();
  private readonly composite = compositeMaterial();
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
  private readonly quadScene = new THREE.Scene().add(this.quad);
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private targets: Targets | null = null;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.quad.frustumCulled = false;
  }

  private ensureTargets(width: number, height: number): Targets {
    if (this.targets?.width === width && this.targets.height === height) return this.targets;

    disposeTargets(this.targets);
    this.targets = makeTargets(width, height);

    return this.targets;
  }

  private pass(rt: THREE.WebGLRenderTarget, camera: THREE.Camera) {
    this.renderer.setRenderTarget(rt);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, camera);
  }

  private useMaterials(parts: StagePart[], which: 'id' | 'toon') {
    for (const part of parts) {
      for (const { mesh, toon } of part.meshes) mesh.material = which === 'id' ? part.idMaterial : toon;
    }
  }

  private renderPasses(parts: StagePart[], camera: THREE.OrthographicCamera, t: Targets) {
    this.scene.overrideMaterial = this.normal;
    this.pass(t.normal, camera);
    this.scene.overrideMaterial = null;
    this.useMaterials(parts, 'id');
    this.pass(t.id, camera);
    this.useMaterials(parts, 'toon');
    this.pass(t.color, camera);
  }

  draw(parts: StagePart[], camera: THREE.OrthographicCamera, size: { width: number; height: number }): string {
    const width = size.width * SUPERSAMPLE;
    const height = size.height * SUPERSAMPLE;
    const t = this.ensureTargets(width, height);
    const u = this.composite.uniforms;
    const mmPerPx = (camera.right - camera.left) / width;

    this.renderer.setSize(width, height, false);
    this.renderPasses(parts, camera, t);
    u.tColor.value = t.color.texture;
    u.tNormal.value = t.normal.texture;
    u.tId.value = t.id.texture;
    u.tDepth.value = t.normal.depthTexture;
    u.texel.value.set(1 / width, 1 / height);
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.depthEdge.value = Math.max(mmPerPx * 6, 0.4);
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.quadScene, this.quadCamera);

    return downscale(this.renderer.domElement, size.width, size.height);
  }

  countNew(parts: StagePart[], camera: THREE.OrthographicCamera, size: { width: number; height: number }): number {
    const t = this.ensureTargets(size.width, size.height);
    const pixels = new Uint8Array(size.width * size.height * 4);
    let count = 0;

    this.renderer.setSize(size.width, size.height, false);
    this.useMaterials(parts, 'id');
    this.pass(t.id, camera);
    this.renderer.readRenderTargetPixels(t.id, 0, 0, size.width, size.height, pixels);
    this.renderer.setRenderTarget(null);

    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 127 && pixels[i + 2] > 191) count++;

    return count;
  }

  dispose() {
    disposeTargets(this.targets);
    this.targets = null;
    this.normal.dispose();
    this.composite.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

function downscale(source: HTMLCanvasElement, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);

  return canvas.toDataURL('image/png');
}
