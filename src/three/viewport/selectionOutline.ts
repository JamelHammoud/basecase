import * as THREE from 'three';
import { whenIdle } from '../../utils/whenIdle';
import type { Stage } from './stage';

const OUTLINE_LAYER = 7;
const OUTLINE_PX = 2.5;
const OUTLINE_ORDER = 1000;
const FULL_SCREEN = new THREE.Vector4(-1, -1, 1, 1);

const vertexShader = `
  uniform vec4 rect;
  varying vec2 vUv;

  void main() {
    vec2 ndc = mix(rect.xy, rect.zw, position.xy);
    vUv = ndc * 0.5 + 0.5;
    gl_Position = vec4(ndc, 0.0, 1.0);
  }
`;

const fragmentShader = `
  #define MAX_RADIUS 6
  uniform sampler2D mask;
  uniform vec2 texel;
  uniform float radius;
  varying vec2 vUv;

  void main() {
    float inside = texture2D(mask, vUv).r;

    if (inside > 0.99) discard;

    float edge = 0.0;

    for (int x = -MAX_RADIUS; x <= MAX_RADIUS; x++) {
      for (int y = -MAX_RADIUS; y <= MAX_RADIUS; y++) {
        vec2 offset = vec2(float(x), float(y));
        float reach = clamp(radius + 0.5 - length(offset), 0.0, 1.0);

        if (reach > 0.0) edge = max(edge, texture2D(mask, vUv + offset * texel).r * reach);
      }
    }

    float alpha = edge * (1.0 - inside);

    if (alpha <= 0.0) discard;

    gl_FragColor = vec4(0.051, 0.6, 1.0, alpha);
  }
`;

function createQuad(target: THREE.WebGLRenderTarget): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      mask: { value: target.texture },
      texel: { value: new THREE.Vector2(1, 1) },
      radius: { value: OUTLINE_PX },
      rect: { value: FULL_SCREEN.clone() },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(geometry, material);

  quad.frustumCulled = false;
  quad.renderOrder = OUTLINE_ORDER;
  quad.visible = false;
  quad.raycast = () => {};

  return quad;
}

const corners = (box: THREE.Box3) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) =>
      new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
  );

function screenRect(groups: THREE.Object3D[], camera: THREE.PerspectiveCamera, pad: THREE.Vector2) {
  const box = new THREE.Box3();

  groups.forEach((group) => box.expandByObject(group));

  if (box.isEmpty()) {
    return null;
  }

  const points = corners(box).map((corner) => corner.applyMatrix4(camera.matrixWorldInverse));

  if (points.some((point) => point.z > -camera.near)) {
    return FULL_SCREEN;
  }

  const ndc = points.map((point) => point.applyMatrix4(camera.projectionMatrix));
  const rect = new THREE.Vector4(
    Math.max(-1, Math.min(...ndc.map((p) => p.x)) - pad.x),
    Math.max(-1, Math.min(...ndc.map((p) => p.y)) - pad.y),
    Math.min(1, Math.max(...ndc.map((p) => p.x)) + pad.x),
    Math.min(1, Math.max(...ndc.map((p) => p.y)) + pad.y),
  );

  return rect.x < rect.z && rect.y < rect.w ? rect : null;
}

export class SelectionOutline {
  private readonly stage: Stage;

  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    samples: 4,
    depthBuffer: false,
    format: THREE.RedFormat,
  });

  private readonly maskMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  private readonly quad: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  private tagged = new Set<THREE.Object3D>();

  private readonly size = new THREE.Vector2();

  private readonly cancelWarm: () => void;

  constructor(stage: Stage) {
    this.stage = stage;
    this.quad = createQuad(this.target);
    stage.overlays.add(this.quad);
    this.cancelWarm = whenIdle(() => this.warm());
  }

  prepare(groups: THREE.Object3D[]): void {
    const meshes = this.tag(groups);

    this.quad.visible = meshes > 0;

    if (!meshes) {
      return;
    }

    this.renderMask();

    const { renderer, camera } = this.stage;
    const radius = OUTLINE_PX * renderer.getPixelRatio();
    const uniforms = this.quad.material.uniforms;
    const pad = new THREE.Vector2(((radius + 1) * 2) / this.size.x, ((radius + 1) * 2) / this.size.y);
    const rect = screenRect(groups, camera, pad);

    this.quad.visible = Boolean(rect);
    uniforms.radius.value = radius;
    (uniforms.texel.value as THREE.Vector2).set(1 / this.size.x, 1 / this.size.y);

    if (rect) (uniforms.rect.value as THREE.Vector4).copy(rect);
  }

  dispose(): void {
    this.cancelWarm();
    this.tag([]);
    this.quad.removeFromParent();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
    this.maskMaterial.dispose();
    this.target.dispose();
  }

  private tag(groups: THREE.Object3D[]): number {
    const next = new Set<THREE.Object3D>();

    for (const group of groups) {
      group.traverseVisible((object) => {
        if ((object as THREE.Mesh).isMesh) next.add(object);
      });
    }

    this.tagged.forEach((object) => next.has(object) || object.layers.disable(OUTLINE_LAYER));
    next.forEach((object) => object.layers.enable(OUTLINE_LAYER));
    this.tagged = next;

    return next.size;
  }

  private renderMask(): void {
    const { renderer, scene, camera } = this.stage;
    const saved = {
      background: scene.background,
      layers: camera.layers.mask,
      shadows: renderer.shadowMap.needsUpdate,
      clear: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
      target: renderer.getRenderTarget(),
    };

    renderer.getDrawingBufferSize(this.size);

    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y);
    }

    scene.background = null;
    scene.overrideMaterial = this.maskMaterial;
    camera.layers.set(OUTLINE_LAYER);
    renderer.shadowMap.needsUpdate = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(saved.target);
    renderer.setClearColor(saved.clear, saved.alpha);
    renderer.shadowMap.needsUpdate = saved.shadows;
    camera.layers.mask = saved.layers;
    scene.overrideMaterial = null;
    scene.background = saved.background;
  }

  private warm(): void {
    const { renderer, camera } = this.stage;
    const probe = new THREE.BoxGeometry(1, 1, 1);
    const maskScene = new THREE.Scene().add(new THREE.Mesh(probe, this.maskMaterial));
    const quadScene = new THREE.Scene().add(new THREE.Mesh(this.quad.geometry, this.quad.material));
    const previous = renderer.getRenderTarget();

    renderer.setRenderTarget(this.target);
    renderer.compile(maskScene, camera);
    renderer.setRenderTarget(previous);
    renderer.compile(quadScene, camera);
    probe.dispose();
  }
}
