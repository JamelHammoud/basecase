import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ScenePart } from '../types/robotics';
import { buildPartGroup, releasePartGroup } from './buildPartMesh';
import { brightenEdges, createStudioScene, exposureFor, frame } from './thumbnailStage';
import { MAX_POLAR, MIN_POLAR } from './viewport/types';
import { listenToWheel } from './viewport/wheel';

export interface PartPreviewOptions {
  panScroll: () => boolean;
  order: number;
}

interface PreviewStage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
}

const TIGHTNESS = 0.95;
const ZOOM_IN_LIMIT = 0.2;
const ZOOM_OUT_LIMIT = 4;

let stage: PreviewStage | null = null;
let unmountActive: (() => void) | null = null;
let activeOrder = 0;
let lastOrder = 0;

export const nextPreviewOrder = () => ++lastOrder;

const noop = () => {};

function createStage(): PreviewStage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
  const orbit = new OrbitControls(camera, renderer.domElement);

  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.enableZoom = false;
  orbit.minPolarAngle = MIN_POLAR;
  orbit.maxPolarAngle = MAX_POLAR;

  return { renderer, scene: createStudioScene(renderer), camera, orbit };
}

function sizeTo(container: HTMLElement, { renderer, camera }: PreviewStage) {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  camera.aspect = width / height;
}

export function mountPartPreview(container: HTMLElement, parts: ScenePart[], options: PartPreviewOptions): () => void {
  if (unmountActive && options.order < activeOrder) return noop;

  unmountActive?.();
  activeOrder = options.order;
  stage ??= createStage();

  const current = stage;
  const { renderer, scene, camera, orbit } = current;
  const groups = parts.map((part) => buildPartGroup(part, false, { shareGeometry: true }));
  const root = new THREE.Group().add(...groups);
  let frameId = 0;

  const draw = () => {
    frameId = 0;

    if (orbit.update()) invalidate();

    renderer.render(scene, camera);
  };
  const invalidate = () => {
    frameId ||= requestAnimationFrame(draw);
  };

  brightenEdges(root);
  scene.add(root);
  root.updateMatrixWorld(true);
  sizeTo(container, current);
  container.appendChild(renderer.domElement);
  orbit.target.copy(frame(camera, root, TIGHTNESS));
  orbit.update();
  renderer.toneMappingExposure = exposureFor(root);

  const distance = camera.position.distanceTo(orbit.target);
  const stopWheel = listenToWheel(current, renderer.domElement, () => ({
    minDistance: distance * ZOOM_IN_LIMIT,
    maxDistance: distance * ZOOM_OUT_LIMIT,
    panScroll: options.panScroll(),
  }));

  orbit.addEventListener('change', invalidate);
  renderer.render(scene, camera);

  const unmount = () => {
    if (unmountActive !== unmount) return;

    unmountActive = null;
    cancelAnimationFrame(frameId);
    stopWheel();
    orbit.removeEventListener('change', invalidate);
    scene.remove(root);
    groups.forEach(releasePartGroup);
    renderer.domElement.remove();
  };

  unmountActive = unmount;

  return unmount;
}
