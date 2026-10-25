import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const WIDTH = 480;
const HEIGHT = 360;

export const VIEW_DIRECTION = new THREE.Vector3(1, 0.75, 1.15).normalize();

interface ThumbnailStage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

let stage: ThumbnailStage | null = null;

export function createStudioScene(renderer: THREE.WebGLRenderer): THREE.Scene {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  const rim = new THREE.DirectionalLight(0x9fd3ff, 0.6);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  key.position.set(120, 220, 160);
  rim.position.set(-160, 80, -120);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1e, 1.4), key, rim);

  return scene;
}

const offscreen = () => (typeof document === 'undefined' ? new OffscreenCanvas(WIDTH, HEIGHT) : undefined);

function createStage(): ThumbnailStage {
  const renderer = new THREE.WebGLRenderer({
    canvas: offscreen(),
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });

  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);

  return {
    renderer,
    scene: createStudioScene(renderer),
    camera: new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 1, 4000),
  };
}

export const brightenEdges = (group: THREE.Object3D) =>
  group.traverse((child) => {
    if (!(child as THREE.LineSegments).isLineSegments) return;

    const material = (child as THREE.LineSegments).material as THREE.LineBasicMaterial;

    material.opacity = Math.min(1, material.opacity + 0.25);
  });

function averageLightness(group: THREE.Object3D): number {
  const hsl = { h: 0, s: 0, l: 0 };
  let sum = 0;
  let count = 0;

  group.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;

    if (!(object as THREE.Mesh).isMesh || !material?.color) return;

    material.color.getHSL(hsl, THREE.SRGBColorSpace);
    sum += hsl.l;
    count++;
  });

  return count ? sum / count : 0.5;
}

const exposureForLightness = (lightness: number) => {
  if (lightness < 0.15) {
    return 1.6;
  }

  return lightness < 0.3 ? 1.35 : 1.15;
};

export const exposureFor = (group: THREE.Object3D) => exposureForLightness(averageLightness(group));

export function frame(camera: THREE.PerspectiveCamera, group: THREE.Object3D, tightness: number): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * tightness;

  camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance);
  camera.near = distance / 50;
  camera.far = distance * 10;
  camera.updateProjectionMatrix();
  camera.lookAt(center);

  return center;
}

export type ThumbnailCanvas = HTMLCanvasElement | OffscreenCanvas;

export function drawThumbnail(group: THREE.Object3D, tightness: number): ThumbnailCanvas {
  stage ??= createStage();

  const { renderer, scene, camera } = stage;

  brightenEdges(group);
  scene.add(group);
  group.updateMatrixWorld(true);
  frame(camera, group, tightness);
  renderer.toneMappingExposure = exposureFor(group);
  renderer.render(scene, camera);
  scene.remove(group);

  return renderer.domElement;
}

export function canvasBlob(canvas: ThumbnailCanvas, type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });

  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
