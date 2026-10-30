import * as THREE from 'three';
import { encodeBitmap, encodeLabelled } from '../../utils/imageEncode';
import type { GridSpec } from '../../utils/labelOverlay';
import { fittedSize } from '../../utils/imageOps';
import { CANVAS_BACKGROUND } from '../../utils/imageFile';
import { gridSpec, labelColors, paintFlat } from './labelCapture';
import type { ViewportContext } from './viewportContext';

const VIEW_DIRECTIONS: Record<string, THREE.Vector3> = {
  iso: new THREE.Vector3(0.9, 0.7, 1.2),
  front: new THREE.Vector3(0, 0.08, 1),
  back: new THREE.Vector3(0, 0.08, -1),
  side: new THREE.Vector3(1, 0.08, 0),
  top: new THREE.Vector3(0, 1, 0.001),
};

export class Hider {
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

export function viewDirection(view: string): THREE.Vector3 {
  const custom = /^az:(-?[\d.]+),el:(-?[\d.]+)$/.exec(view);

  if (!custom) {
    return (VIEW_DIRECTIONS[view] ?? VIEW_DIRECTIONS.iso).clone().normalize();
  }

  const az = THREE.MathUtils.degToRad(Number(custom[1]));
  const el = THREE.MathUtils.degToRad(Math.max(-89, Math.min(89, Number(custom[2]))));

  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

export function hideHelpers(ctx: ViewportContext, hider: Hider, helper: THREE.Object3D | undefined): void {
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

export function hideForViews(ctx: ViewportContext, hider: Hider, onlyIds?: string[]): void {
  for (const child of ctx.stage.partsRoot.children) {
    const id = child.userData.partId as string;
    const excluded = onlyIds?.length && !onlyIds.includes(id);

    if (ctx.layer.part(id)?.kind === 'image_plane' || excluded) hider.hide(child);
  }
}

export function hideForSilhouette(ctx: ViewportContext, hider: Hider): void {
  const { scene, partsRoot } = ctx.stage;

  scene.children.filter((child) => child !== partsRoot).forEach((child) => hider.hide(child));
  partsRoot.traverse((o) => {
    if ((o as THREE.LineSegments).isLineSegments) hider.hide(o);
  });
}

export function visibleBounds(root: THREE.Object3D, marks?: THREE.Box3) {
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
  labels?: string[];
  grid?: boolean;
  maxSide?: number;
  helper?: THREE.Object3D;
  marks?: THREE.Box3;
}

const VIEW_QUALITY = 0.86;

const imageFormat = (request: CaptureRequest) =>
  request.silhouette || !request.maxSide
    ? ({ type: 'image/png' } as const)
    : ({ type: 'image/jpeg', quality: VIEW_QUALITY, background: CANVAS_BACKGROUND } as const);

export function snapshot(canvas: HTMLCanvasElement, maxSide?: number): ImageBitmap {
  const { width, height } = fittedSize(canvas.width, canvas.height, maxSide);
  const copy = new OffscreenCanvas(width, height);
  const ctx = copy.getContext('2d')!;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, width, height);

  return copy.transferToImageBitmap();
}

interface Shot {
  view: string;
  bitmap: ImageBitmap;
  grid: GridSpec | null;
}

function prepareScene(ctx: ViewportContext, request: CaptureRequest, hider: Hider): () => void {
  const { renderer, scene } = ctx.stage;
  const previous = { background: scene.background, exposure: renderer.toneMappingExposure };
  const flat = Boolean(request.silhouette || request.labels);
  const silhouette = request.silhouette ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : null;
  const unpaint = request.labels ? paintFlat(ctx.stage.partsRoot, labelColors(request.labels)) : null;

  scene.background = new THREE.Color(flat ? '#000000' : '#2c2c2c');
  renderer.toneMappingExposure = previous.exposure * 1.35;
  scene.overrideMaterial = silhouette;

  if (flat) hideForSilhouette(ctx, hider);

  return () => {
    scene.overrideMaterial = null;
    silhouette?.dispose();
    unpaint?.();
    scene.background = previous.background;
    renderer.toneMappingExposure = previous.exposure;
  };
}

function renderShots(ctx: ViewportContext, request: CaptureRequest): Shot[] {
  const { renderer, scene, camera: mainCamera, partsRoot } = ctx.stage;
  const { center, radius } = visibleBounds(partsRoot, request.marks);
  const camera = new THREE.PerspectiveCamera(24, mainCamera.aspect, 1, 10000);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.08;
  const headlight = new THREE.DirectionalLight(0xffffff, 2.4);
  const fullSize = request.silhouette || request.labels || request.grid;

  scene.add(headlight, headlight.target);

  const shots = request.views.map((view) => {
    camera.position.copy(center).addScaledVector(viewDirection(view), distance);
    camera.near = distance / 100;
    camera.far = distance * 10;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    headlight.position.copy(camera.position).add(new THREE.Vector3(0, radius * 0.6, 0));
    headlight.target.position.copy(center);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);

    const bitmap = snapshot(renderer.domElement, fullSize ? undefined : request.maxSide);

    return { view, bitmap, grid: request.grid ? gridSpec(camera, center, bitmap.height) : null };
  });

  scene.remove(headlight, headlight.target);
  headlight.dispose();

  return shots;
}

async function encodeShot(request: CaptureRequest, { view, bitmap, grid }: Shot) {
  if (!request.labels && !grid) return { view, dataUrl: await encodeBitmap({ bitmap, ...imageFormat(request) }) };

  const colors = labelColors(request.labels ?? []);
  const { dataUrl, labels } = await encodeLabelled({ bitmap, colors, grid, maxSide: request.maxSide });

  return { view, dataUrl, labels };
}

export async function captureViews(
  ctx: ViewportContext,
  request: CaptureRequest,
): Promise<Array<{ view: string; dataUrl: string; labels?: number[] }>> {
  const hider = new Hider();

  hideHelpers(ctx, hider, request.helper);
  hideForViews(ctx, hider, request.onlyIds);

  const restore = prepareScene(ctx, request, hider);
  const shots = renderShots(ctx, request);

  restore();
  hider.restore();
  ctx.loop.invalidate();
  ctx.loop.renderNow();

  return Promise.all(shots.map((shot) => encodeShot(request, shot)));
}
