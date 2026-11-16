import * as THREE from 'three';
import { compositeMaterial } from './guideShaders';

export const SUPERSAMPLE = 2;

const MAX_ENCODING = 3;

export interface StagePart {
  group: THREE.Group;
  meshes: Array<{ mesh: THREE.Mesh; toon: THREE.ShaderMaterial }>;
  idMaterial: THREE.ShaderMaterial;
  index: number;
}

const target = (width: number, height: number, depthTexture?: THREE.DepthTexture, count = 1) =>
  new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    count,
    ...(depthTexture ? { depthTexture } : {}),
  });

function makeTargets(width: number, height: number): THREE.WebGLRenderTarget {
  return target(width, height, new THREE.DepthTexture(width, height, THREE.FloatType), 3);
}

function disposeTargets(targets: THREE.WebGLRenderTarget | null) {
  targets?.depthTexture?.dispose();
  targets?.dispose();
}

export class GuideStage {
  readonly scene = new THREE.Scene();
  private readonly canvas = new OffscreenCanvas(8, 8);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composite = compositeMaterial();
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
  private readonly quadScene = new THREE.Scene().add(this.quad);
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private targets: THREE.WebGLRenderTarget | null = null;
  private visibility: THREE.WebGLRenderTarget | null = null;
  private readonly encoding = new Set<Promise<string>>();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.debug.onShaderError = (context, program) => {
      throw new Error(context.getProgramInfoLog(program) || 'Couldn’t draw the build guide.');
    };
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.quad.frustumCulled = false;
  }

  private ensureTargets(width: number, height: number): THREE.WebGLRenderTarget {
    if (this.targets?.width === width && this.targets.height === height) return this.targets;

    disposeTargets(this.targets);
    this.targets = makeTargets(width, height);

    return this.targets;
  }

  private visibilityTarget(width: number, height: number): THREE.WebGLRenderTarget {
    if (this.visibility?.width === width && this.visibility.height === height) return this.visibility;

    this.visibility?.dispose();
    this.visibility = target(width, height);

    return this.visibility;
  }

  private pass(rt: THREE.WebGLRenderTarget, camera: THREE.Camera) {
    this.renderer.setRenderTarget(rt);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, camera);
  }

  private useMaterials(parts: StagePart[], which: 'id' | 'toon') {
    for (const part of parts) {
      for (const { mesh, toon } of part.meshes) {
        toon.uniforms.idColor.value.copy(part.idMaterial.uniforms.idColor.value);
        mesh.material = which === 'id' ? part.idMaterial : toon;
      }
    }
  }

  async ready() {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    while (this.encoding.size >= MAX_ENCODING) await Promise.race(this.encoding);
  }

  async flush() {
    await Promise.all(this.encoding);
  }

  draw(parts: StagePart[], camera: THREE.OrthographicCamera, size: { width: number; height: number }): Promise<string> {
    const width = size.width * SUPERSAMPLE;
    const height = size.height * SUPERSAMPLE;
    const t = this.ensureTargets(width, height);
    const u = this.composite.uniforms;
    const mmPerPx = (camera.right - camera.left) / width;

    this.renderer.setSize(width, height, false);
    this.useMaterials(parts, 'toon');
    this.pass(t, camera);
    u.tColor.value = t.textures[2];
    u.tNormal.value = t.textures[0];
    u.tId.value = t.textures[1];
    u.tDepth.value = t.depthTexture;
    u.texel.value.set(1 / width, 1 / height);
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.depthEdge.value = Math.max(mmPerPx * 6, 0.4);
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.quadScene, this.quadCamera);

    const image = encodePng(downscale(this.canvas, size.width, size.height));

    this.encoding.add(image);
    void image.finally(() => this.encoding.delete(image)).catch(() => undefined);

    return image;
  }

  countNew(parts: StagePart[], camera: THREE.OrthographicCamera, size: { width: number; height: number }): number {
    const visibility = this.visibilityTarget(size.width, size.height);
    const pixels = new Uint8Array(size.width * size.height * 4);
    let count = 0;

    this.renderer.setSize(size.width, size.height, false);
    this.useMaterials(parts, 'id');
    this.pass(visibility, camera);
    this.renderer.readRenderTargetPixels(visibility, 0, 0, size.width, size.height, pixels);
    this.renderer.setRenderTarget(null);

    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 127 && pixels[i + 2] > 191) count++;

    return count;
  }

  dispose() {
    disposeTargets(this.targets);
    this.targets = null;
    this.visibility?.dispose();
    this.visibility = null;
    this.composite.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

function downscale(source: OffscreenCanvas, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);

  return canvas;
}

async function encodePng(canvas: OffscreenCanvas): Promise<string> {
  return blobDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Couldn’t read the drawing'));
    reader.readAsDataURL(blob);
  });
}
