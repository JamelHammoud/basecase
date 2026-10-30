import * as THREE from 'three';
import {
  Hider,
  hideForSilhouette,
  hideForViews,
  hideHelpers,
  snapshot,
  viewDirection,
  visibleBounds,
} from './captures';
import type { ViewportContext } from './viewportContext';

export interface CameraSpec {
  az: number;
  el: number;
  fov: number;
}

export interface SilhouetteShot {
  bitmap: ImageBitmap;
  mmPerPx: number;
  distanceMm: number;
}

interface SilhouetteRequest {
  specs: CameraSpec[];
  onlyIds?: string[];
  maxSide: number;
  helper?: THREE.Object3D;
}

export function silhouetteShots(ctx: ViewportContext, request: SilhouetteRequest): SilhouetteShot[] {
  const { renderer, scene, camera: mainCamera, partsRoot } = ctx.stage;
  const hider = new Hider();
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const background = scene.background;

  hideHelpers(ctx, hider, request.helper);
  hideForViews(ctx, hider, request.onlyIds);
  hideForSilhouette(ctx, hider);
  scene.overrideMaterial = material;
  scene.background = new THREE.Color('#000000');

  const { center, radius } = visibleBounds(partsRoot);
  const camera = new THREE.PerspectiveCamera(24, mainCamera.aspect, 1, 100000);
  const shots = request.specs.map(({ az, el, fov }) => {
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 1.08;

    camera.fov = fov;
    camera.position.copy(center).addScaledVector(viewDirection(`az:${az},el:${el}`), distance);
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    const bitmap = snapshot(renderer.domElement, request.maxSide);
    const viewHeightMm = 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov / 2));

    return { bitmap, mmPerPx: viewHeightMm / bitmap.height, distanceMm: distance };
  });

  scene.overrideMaterial = null;
  scene.background = background;
  material.dispose();
  hider.restore();
  ctx.loop.invalidate();

  return shots;
}
