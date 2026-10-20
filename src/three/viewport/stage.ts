import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createInfiniteGrid } from '../infiniteGrid';
import { FAR_PLANE, MAX_DIST, MAX_POLAR, MIN_DIST, MIN_POLAR } from './types';

export interface Stage {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbit: OrbitControls;
  partsRoot: THREE.Group;
  gridGroup: THREE.Group;
  grid: ReturnType<typeof createInfiniteGrid>;
  brushCursor: THREE.Group;
  overlays: THREE.Group;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  envMap: THREE.Texture;
}

const createRenderer = (container: HTMLElement) => {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });

  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  Object.assign(renderer.domElement.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  });
  container.replaceChildren(renderer.domElement);

  return renderer;
};

const createKeyLight = () => {
  const light = new THREE.DirectionalLight(0xffffff, 1.35);
  const half = 180;

  light.position.set(140, 260, 160);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { near: 20, far: 700, left: -half, right: half, top: half, bottom: -half });
  light.shadow.bias = -0.0005;

  return light;
};

const createLights = (scene: THREE.Scene) => {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x18181b, 1.0);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
  const keyLight = createKeyLight();
  const rim = new THREE.DirectionalLight(0x38bdf8, 0.45);

  hemi.position.set(0, 300, 0);
  rim.position.set(-160, 120, -140);
  scene.add(hemi, fillLight, fillLight.target, keyLight, rim);

  return { keyLight, fillLight };
};

const createGround = (scene: THREE.Scene) => {
  const gridGroup = new THREE.Group();
  const plane = new THREE.PlaneGeometry(60000, 60000);
  const shadowPlane = new THREE.Mesh(plane, new THREE.ShadowMaterial({ opacity: 0.32 }));
  const grid = createInfiniteGrid();

  plane.rotateX(-Math.PI / 2);
  shadowPlane.receiveShadow = true;
  shadowPlane.position.y = -0.05;
  gridGroup.add(shadowPlane, grid.mesh);
  scene.add(gridGroup);

  return { gridGroup, grid };
};

const ignoreRaycast = <T extends THREE.Object3D>(object: T) => {
  object.raycast = () => {};

  return object;
};

const createBrushCursor = (scene: THREE.Scene) => {
  const cursor = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x0d99ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const stem = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.55)]);

  cursor.visible = false;
  cursor.add(
    ignoreRaycast(new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 40), ringMaterial)),
    ignoreRaycast(new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), ringMaterial)),
    ignoreRaycast(new THREE.Line(stem, new THREE.LineBasicMaterial({ color: 0x0d99ff, depthTest: false }))),
  );
  scene.add(cursor);

  return cursor;
};

const createOrbit = (camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) => {
  const orbit = new OrbitControls(camera, canvas);

  orbit.target.set(0, 18, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.enableZoom = false;
  orbit.minDistance = MIN_DIST;
  orbit.maxDistance = MAX_DIST;
  orbit.minPolarAngle = MIN_POLAR;
  orbit.maxPolarAngle = MAX_POLAR;
  orbit.update();

  return orbit;
};

export function createStage(container: HTMLElement): Stage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    container.clientWidth / Math.max(1, container.clientHeight),
    1,
    FAR_PLANE,
  );
  const renderer = createRenderer(container);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const partsRoot = new THREE.Group();
  const overlays = new THREE.Group();

  pmrem.dispose();
  scene.background = new THREE.Color('#1b1b1b');
  scene.environment = envMap;
  scene.environmentIntensity = 0.5;
  camera.position.set(170, 135, 180);
  scene.add(partsRoot, overlays);

  return {
    container,
    scene,
    camera,
    renderer,
    orbit: createOrbit(camera, renderer.domElement),
    partsRoot,
    ...createLights(scene),
    ...createGround(scene),
    brushCursor: createBrushCursor(scene),
    overlays,
    envMap,
  };
}

export function disposeStage(stage: Stage): void {
  stage.orbit.dispose();
  stage.envMap.dispose();
  stage.renderer.dispose();
  stage.renderer.forceContextLoss();
}

export function canvasNdc(stage: Stage, clientX: number, clientY: number): THREE.Vector2 {
  const rect = stage.renderer.domElement.getBoundingClientRect();

  return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
}
