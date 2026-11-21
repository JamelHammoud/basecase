import * as THREE from 'three';
import {
  appearanceDesign,
  appearanceFinish,
  appearanceMeshes,
  appearanceTextureBytes,
} from '../../appearance/appearance.fixtures';
import { finishAppearance } from '../../appearance/model';
import { textureAsset, textureAssetHash } from '../../appearance/textureAsset';
import { textureResources } from '../../appearance/textures';
import { registerWorldAsset } from '../../cases/worldAssets';
import { buildRig, poseDeltas } from '../../utils/kinematics';
import { box } from '../../sim/fixtures/parts';
import { provideMeshFiles, type RenderMeshFiles } from '../componentMeshes';
import { withPreparedParts } from '../thumbnailRender';
import { applyPartTransform } from '../buildPartMesh';
import { compositionCamera, compositionRoot, releaseComposition, type CompositionSnapshot } from './scene';
import { renderCompositionJob, createCompositionStage, type CompositionStage, type CompositionJob } from './render';
import { defaultComposition } from './settings';

let stage: CompositionStage | undefined;
let cameraFile: ArrayBuffer;

function renderCheckJob(job: CompositionJob) {
  stage ??= createCompositionStage();

  return renderCompositionJob(job, stage);
}

async function decode(png: Blob) {
  const bitmap = await createImageBitmap(png);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  return {
    size: [canvas.width, canvas.height],
    pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
  };
}

function geometryChecks(snapshot: CompositionSnapshot) {
  const root = compositionRoot(snapshot);
  let transforms = true;
  let materials = true;
  let helpers = 0;

  for (const group of root.children) {
    const part = snapshot.parts.find((part) => part.id === group.userData.partId)!;
    const expected = new THREE.Group();

    applyPartTransform(expected, part);
    expected.updateMatrix();

    if (snapshot.pose[part.id]) expected.matrix.premultiply(new THREE.Matrix4().fromArray(snapshot.pose[part.id]));

    transforms &&= group.matrixWorld.elements.every(
      (value, index) => Math.abs(value - expected.matrix.elements[index]) < 1e-9,
    );

    for (const mesh of appearanceMeshes(group)) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const appearance = part.appearance!;

      materials &&=
        material.roughness === appearance.roughness &&
        material.metalness === appearance.metalness &&
        material.opacity === appearance.opacity &&
        material.color.getHexString() === appearance.baseColor.slice(1);
      materials &&= !appearance.textures?.baseColor || material.map?.colorSpace === THREE.SRGBColorSpace;
    }

    root.traverseVisible((object) => {
      if (object instanceof THREE.Line || object instanceof THREE.Sprite) helpers++;
    });
  }

  releaseComposition(root);

  return { transforms, materials, helpers };
}

function framingCheck(snapshot: CompositionSnapshot, view: ReturnType<typeof defaultComposition>['view']) {
  const settings = { ...defaultComposition(), width: 96, height: 64, view };
  const root = compositionRoot(snapshot);
  const camera = compositionCamera(settings);
  const box = new THREE.Box3().setFromObject(root);
  let framed = true;

  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);

        framed &&= Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1;
      }
    }
  }

  releaseComposition(root);

  return framed;
}

const foreground = (pixels: number[]) => pixels.filter((value, index) => index % 4 === 3 && value > 0).length;
const difference = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + Number(Math.abs(value - b[index]) > 5), 0) / a.length;

async function compositionDesign(index: number) {
  const design = appearanceDesign(index);
  const asset = textureAsset(appearanceTextureBytes());
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  const parts = design.parts.map((part) => ({
    ...part,
    appearance: {
      ...finishAppearance(appearanceFinish(index, part), part.color),
      ...([5, 6].includes(index) ? { textures: { baseColor: hash } } : {}),
    },
  }));
  const values = Object.fromEntries(
    design.joints.filter((joint) => joint.type === 'revolute').map((joint) => [joint.id, 20]),
  );
  const pose = Object.fromEntries(
    [
      ...poseDeltas(
        buildRig(design.joints, parts),
        { values },
        parts.map((part) => part.id),
      ),
    ].map(([id, matrix]) => [id, matrix.toArray()]),
  );
  const snapshot = { parts, pose };
  const settings = { ...defaultComposition(), width: 96, height: 64, transparent: true };
  const meshes = { ['texture:' + hash]: asset.encoded };

  provideMeshFiles(meshes);

  const geometry = await withPreparedParts(parts, () => geometryChecks(snapshot));
  const result = await renderCheckJob({ snapshot, settings, meshes, frame: true });
  const decoded = await decode(result.png);
  const framed = await withPreparedParts(parts, () => framingCheck(snapshot, result.view));
  const repeat = await decode(
    (await renderCheckJob({ snapshot, settings: { ...settings, view: result.view }, meshes })).png,
  );

  return {
    ...geometry,
    size: decoded.size,
    foreground: foreground(decoded.pixels),
    backgroundAlpha: decoded.pixels[3],
    partialAlpha: decoded.pixels.filter((value, index) => index % 4 === 3 && value > 0 && value < 255).length,
    framed,
    repeat: decoded.pixels.every((value, index) => value === repeat.pixels[index]),
    metrics: result.metrics,
  };
}

export async function compositionVariations() {
  const part = appearanceDesign(1).parts[0];
  const parts = [{ ...part, appearance: finishAppearance('metal', '#aaaaaa') }];
  const snapshot = { parts, pose: {} };
  const settings = { ...defaultComposition(), width: 96, height: 64, background: '#808080' };
  const base = await renderCheckJob({ snapshot, settings, meshes: {}, frame: true });
  const first = await decode(base.png);
  const lit = await decode(
    (await renderCheckJob({ snapshot, settings: { ...settings, view: base.view, lighting: 0.1 }, meshes: {} })).png,
  );
  const rotated = await decode(
    (await renderCheckJob({ snapshot, settings: { ...settings, view: base.view, rotation: 90 }, meshes: {} })).png,
  );
  let missingRefused = false;

  try {
    await renderCheckJob({
      snapshot: {
        ...snapshot,
        parts: [{ ...parts[0], appearance: { ...parts[0].appearance, textures: { baseColor: 'f'.repeat(64) } } }],
      },
      settings,
      meshes: {},
    });
  } catch {
    missingRefused = true;
  }

  return {
    opaqueAlpha: first.pixels[3],
    lightingDifference: difference(first.pixels, lit.pixels),
    rotationDifference: difference(first.pixels, rotated.pixels),
    backgroundColor: first.pixels.slice(0, 3),
    missingRefused,
  };
}

export async function compositionLarge() {
  const part = appearanceDesign(0).parts[0];
  const parts = Array.from({ length: 500 }, (_, index) => ({
    ...part,
    id: `module-${index}`,
    position: [(index % 25) * 60, 0, Math.floor(index / 25) * 60] as [number, number, number],
    appearance: finishAppearance('paint', '#88aacc'),
  }));
  const result = await renderCheckJob({
    snapshot: { parts, pose: {} },
    settings: { ...defaultComposition(), width: 96, height: 64, transparent: true },
    meshes: {},
    frame: true,
  });
  const decoded = await decode(result.png);

  return {
    parts: parts.length,
    foreground: foreground(decoded.pixels),
    texturesAfterDisposal: textureResources().textures,
    metrics: result.metrics,
  };
}

async function compositionAlpha() {
  const cover = {
    ...box('cover', [0, 0, 0], [40, 40, 40], 10),
    appearance: { ...finishAppearance('transparent', '#aaaaaa'), opacity: 0.35 },
  };
  const hidden = {
    ...cover,
    id: 'hidden',
    visible: false,
    appearance: { ...cover.appearance, textures: { baseColor: 'f'.repeat(64) } },
  };
  const reference = { ...cover, id: 'reference', role: 'reference' as const };
  const settings = {
    ...defaultComposition(),
    width: 64,
    height: 64,
    transparent: true,
    view: {
      position: [0, 0, 100] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      hfovDeg: 60,
    },
  };
  const result = await renderCompositionJob({
    snapshot: { parts: [cover, hidden, reference], pose: {} },
    settings,
    meshes: {},
  });
  const decoded = await decode(result.png);

  return { center: decoded.pixels[(32 * 64 + 32) * 4 + 3], corner: decoded.pixels[3] };
}

async function warmComposition() {
  const meshes: RenderMeshFiles = { 'raspberry-pi-camera-3': cameraFile };

  return renderCheckJob({
    snapshot: { parts: appearanceDesign(7).parts, pose: {} },
    settings: { ...defaultComposition(), width: 64, height: 64 },
    meshes,
    frame: true,
  }).then((result) => result.png.size);
}

export async function compositionChecks(request: { index: number; cameraBytes: number[] }) {
  if (request.cameraBytes.length) cameraFile = Uint8Array.from(request.cameraBytes).buffer;

  return {
    design: request.index >= 0 ? await compositionDesign(request.index) : null,
    variations: request.index === -1 ? await compositionVariations() : null,
    large: request.index === -2 ? await compositionLarge() : null,
    alpha: request.index === -3 ? await compositionAlpha() : null,
    warm: request.index === -4 ? await warmComposition() : null,
  };
}
