import * as THREE from 'three';
import { blobDataUrl, SUPERSAMPLE, type StagePart } from './guideStage';
import { compositeMaterial } from './guideShaders';
import { GUIDE_NEIGHBORS } from './guideNeighbors';
import { referenceNormal, referenceToon } from './guideReferenceShaders.fixtures';

const oldNeighbors = `
  for (int r = 1; r <= 2; r++) {
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.78539816;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * texel * float(r);
`;

const target = (width: number, height: number) =>
  new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });

function pass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  options: { target: THREE.WebGLRenderTarget; camera: THREE.Camera },
) {
  renderer.setRenderTarget(options.target);
  renderer.clear(true, true, true);
  renderer.render(scene, options.camera);
}

export async function drawReference(parts: StagePart[], camera: THREE.OrthographicCamera) {
  const size = 128;
  const pixels = size * SUPERSAMPLE;
  const canvas = new OffscreenCanvas(8, 8);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  const scene = new THREE.Scene();
  const normal = referenceNormal();
  const composite = compositeMaterial();
  const colors = parts.flatMap((part) =>
    part.meshes.map(({ mesh, toon }) => ({ mesh, toon, reference: referenceToon(toon) })),
  );
  const targets = [target(pixels, pixels), target(pixels, pixels), target(pixels, pixels)];
  const depth = new THREE.DepthTexture(pixels, pixels, THREE.FloatType);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composite);
  const quadScene = new THREE.Scene().add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  targets[0].depthTexture = depth;
  quad.frustumCulled = false;
  composite.fragmentShader = composite.fragmentShader.replace(GUIDE_NEIGHBORS, oldNeighbors);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(pixels, pixels, false);
  renderer.info.autoReset = false;
  renderer.info.reset();

  for (const part of parts) scene.add(part.group);

  try {
    scene.overrideMaterial = normal;
    pass(renderer, scene, { target: targets[0], camera });
    scene.overrideMaterial = null;

    for (const part of parts)
      part.meshes.forEach(({ mesh }) => {
        mesh.material = part.idMaterial;
      });

    pass(renderer, scene, { target: targets[1], camera });
    colors.forEach(({ mesh, reference }) => {
      mesh.material = reference;
    });
    pass(renderer, scene, { target: targets[2], camera });

    const u = composite.uniforms;

    u.tNormal.value = targets[0].texture;
    u.tId.value = targets[1].texture;
    u.tColor.value = targets[2].texture;
    u.tDepth.value = depth;
    u.texel.value.set(1 / pixels, 1 / pixels);
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.depthEdge.value = Math.max(((camera.right - camera.left) / pixels) * 6, 0.4);
    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    renderer.render(quadScene, quadCamera);

    const downscaled = new OffscreenCanvas(size, size);
    const context = downscaled.getContext('2d')!;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(canvas, 0, 0, size, size);

    return {
      image: await blobDataUrl(await downscaled.convertToBlob({ type: 'image/png' })),
      calls: renderer.info.render.calls,
    };
  } finally {
    colors.forEach(({ mesh, toon, reference }) => {
      mesh.material = toon;
      reference.dispose();
    });
    targets.forEach((entry) => entry.dispose());
    depth.dispose();
    quad.geometry.dispose();
    normal.dispose();
    composite.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
