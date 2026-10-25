import * as THREE from 'three';
import { encodeBitmap } from '../../utils/imageEncode';
import { fittedSize } from '../../utils/imageOps';
import { CANVAS_BACKGROUND } from '../../utils/imageFile';
import type { ViewportContext } from './viewportContext';

const VIEW_DIRECTIONS: Record<string, THREE.Vector3> = {
  iso: new THREE.Vector3(0.9, 0.7, 1.2),
  front: new THREE.Vector3(0, 0.08, 1),
  back: new THREE.Vector3(0, 0.08, -1),
  side: new THREE.Vector3(1, 0.08, 0),
  top: new THREE.Vector3(0, 1, 0.001),
};

class Hider {
  private readonly hidden: THREE.Object3D[] = [];

  hide(object?: THREE.Object3D | null): void {
    if (!object?.visible) return;

    object.visible = false;
    this.hidden.push(object);
  }

  restore(): void {
    this.hidden.forEach((o) => (o.visible = true));
    this.hidden.length = 0;
  }
}

function viewDirection(view: string): THREE.Vector3 {
  const custom = /^az:(-?[\d.]+),el:(-?[\d.]+)$/.exec(view);

  if (!custom) {
    return (VIEW_DIRECTIONS[view] ?? VIEW_DIRECTIONS.iso).clone().normalize();
  }

  const az = THREE.MathUtils.degToRad(Number(custom[1]));
  const el = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, Number(custom[2]))));

  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

function hideHelpers(ctx: ViewportContext, hider: Hider, helper: THREE.Object3D | undefined): void {
  hider.hide(helper);
  hider.hide(ctx.stage.brushCursor);
  hider.hide(ctx.stage.overlays);
}

export function captureScreenshot(ctx: ViewportContext, helper: THREE.Object3D | undefined): string {
  const { renderer } = ctx.stage;
  const hider = new Hider();

  hideHelpers(ctx, hider, helper);
  ctx.loop.renderNow();

  const dataUrl = renderer.domElement.toDataURL('image/png');

  hider.restore();
  ctx.loop.renderNow();

  return dataUrl;
}

function hideForViews(ctx: ViewportContext, hider: Hider, onlyIds?: string[]): void {
  for (const child of ctx.stage.partsRoot.children) {
    const id = child.userData.partId as string;
    const excluded = onlyIds?.length && !onlyIds.includes(id);

    if (ctx.layer.part(id)?.kind === 'image_plane' || excluded) hider.hide(child);
  }
}

function hideForSilhouette(ctx: ViewportContext, hider: Hider): void {
  const { scene, partsRoot } = ctx.stage;

  scene.children.filter((child) => child !== partsRoot).forEach((child) => hider.hide(child));
  partsRoot.traverse((o) => {
    if ((o as THREE.LineSegments).isLineSegments) hider.hide(o);
  });
}

function visibleBounds(root: THREE.Object3D, marks?: THREE.Box3) {
  const box = new THREE.Box3();

  root.children.forEach((c) => c.visible && box.expandByObject(c));

  if (marks && !marks.isEmpty()) box.union(marks);

  if (box.isEmpty()) box.set(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 50, 50));

  return {
    center: box.getCenter(new THREE.Vector3()),
    radius: Math.max(box.getSize(new THREE.Vector3()).length() / 2, 20),
  };
}

interface CaptureRequest {
  views: string[];
  onlyIds?: string[];
  silhouette?: boolean;
  maxSide?: number;
  helper?: THREE.Object3D;
  marks?: THREE.Box3;
}

const VIEW_QUALITY = 0.86;

const imageFormat = (request: CaptureRequest) =>
  request.silhouette || !request.maxSide
    ? ({ type: 'image/png' } as const)
    : ({ type: 'image/jpeg', quality: VIEW_QUALITY, background: CANVAS_BACKGROUND } as const);

function snapshot(canvas: HTMLCanvasElement, maxSide?: number): ImageBitmap {
  const { width, height } = fittedSize(canvas.width, canvas.height, maxSide);
  const copy = new OffscreenCanvas(width, height);
  const ctx = copy.getContext('2d')!;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, width, height);

  return copy.transferToImageBitmap();
}

export async function captureViews(
  ctx: ViewportContext,
  request: CaptureRequest,
): Promise<Array<{ view: string; dataUrl: string }>> {
  const { renderer, scene, camera: mainCamera, partsRoot } = ctx.stage;
  const hider = new Hider();
  const silhouette = request.silhouette ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : null;
  const headlight = new THREE.DirectionalLight(0xffffff, 2.4);
  const previous = { background: scene.background, exposure: renderer.toneMappingExposure };

  hideHelpers(ctx, hider, request.helper);
  hideForViews(ctx, hider, request.onlyIds);

  const { center, radius } = visibleBounds(partsRoot, request.marks);
  const camera = new THREE.PerspectiveCamera(24, mainCamera.aspect, 1, 10000);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.08;

  scene.add(headlight, headlight.target);
  scene.background = new THREE.Color(silhouette ? '#000000' : '#2c2c2c');
  renderer.toneMappingExposure = previous.exposure * 1.35;

  if (silhouette) {
    scene.overrideMaterial = silhouette;
    hideForSilhouette(ctx, hider);
  }

  const shots = request.views.map((view) => {
    camera.position.copy(center).addScaledVector(viewDirection(view), distance);
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    headlight.position.copy(camera.position).add(new THREE.Vector3(0, radius * 0.6, 0));
    headlight.target.position.copy(center);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);

    return { view, bitmap: snapshot(renderer.domElement, request.silhouette ? undefined : request.maxSide) };
  });

  scene.remove(headlight, headlight.target);
  headlight.dispose();
  scene.overrideMaterial = null;
  silhouette?.dispose();
  scene.background = previous.background;
  renderer.toneMappingExposure = previous.exposure;
  hider.restore();
  ctx.loop.invalidate();
  ctx.loop.renderNow();

  const format = imageFormat(request);

  return Promise.all(
    shots.map(async ({ view, bitmap }) => ({ view, dataUrl: await encodeBitmap({ bitmap, ...format }) })),
  );
}
