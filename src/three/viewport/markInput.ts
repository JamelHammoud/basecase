import * as THREE from 'three';
import type { MarkLayer } from './markLayer';
import {
  encloses,
  MIN_STROKE_PX,
  pointInPolygon,
  SAMPLE_PX,
  strokeLength,
  thinned,
  viewAngles,
  type Point2,
} from './markMath';
import { hitPartId, partMeshes, partRaycaster } from './picking';
import { DEFAULT_MARK_COLOR } from '../../utils/markColors';
import { canvasNdc } from './stage';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

interface Stroke {
  pointerId: number;
  ndc: THREE.Vector2[];
  pixels: Point2[];
  depth: number | null;
  crossed: Set<string>;
}

const round = (v: number) => Math.round(v * 10) / 10;

export class MarkInput {
  private stroke: Stroke | null = null;

  private frame = 0;

  private readonly raycaster = partRaycaster();

  private readonly ctx: ViewportContext;

  private readonly layer: MarkLayer;

  constructor(ctx: ViewportContext, layer: MarkLayer) {
    this.ctx = ctx;
    this.layer = layer;
  }

  install(): () => void {
    const canvas = this.ctx.stage.renderer.domElement;
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    const cancel = () => this.cancel();

    canvas.addEventListener('pointerdown', down, { capture: true });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);

    return () => {
      this.cancel();
      canvas.removeEventListener('pointerdown', down, { capture: true });
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
    };
  }

  cancel(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;

    if (!this.stroke) return;

    this.stroke = null;
    this.ctx.stage.orbit.enabled = true;
    this.layer.preview(null, '');
    this.ctx.loop.invalidate();
  }

  private onDown(e: PointerEvent): void {
    if (!this.ctx.props().markMode || e.button !== 0) return;

    this.ctx.stage.orbit.enabled = false;
    this.ctx.stage.renderer.domElement.setPointerCapture(e.pointerId);
    this.stroke = { pointerId: e.pointerId, ndc: [], pixels: [], depth: null, crossed: new Set() };
    this.sample(e);
    this.schedule();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.stroke?.pointerId) return;

    this.sample(e);
    this.schedule();
  }

  private onUp(e: PointerEvent): void {
    const stroke = this.stroke;

    if (e.pointerId !== stroke?.pointerId) return;

    this.sample(e);
    this.update();

    const points = this.worldPoints(stroke, thinned(stroke.ndc));
    const enclosed = encloses(stroke.pixels) ? this.enclosedParts(stroke.pixels) : [];
    const partIds = [...new Set([...enclosed, ...stroke.crossed])];

    this.cancel();

    if (strokeLength(stroke.pixels) < MIN_STROKE_PX) {
      this.select(stroke.pixels[0]);

      return;
    }

    this.ctx.props().onAddMark?.({
      points: points.map((p): Vec3 => [round(p.x), round(p.y), round(p.z)]),
      partIds,
      view: this.view(),
    });
  }

  private select(pixel: Point2 | undefined): void {
    const { camera, renderer } = this.ctx.stage;
    const canvas = renderer.domElement;
    const id = pixel
      ? this.layer.hitTest(pixel, camera, { width: canvas.clientWidth, height: canvas.clientHeight })
      : null;

    this.ctx.props().onSelectMark?.(id);
  }

  private view(): string {
    const { camera, orbit } = this.ctx.stage;

    return viewAngles(camera.position.clone().sub(orbit.target).toArray());
  }

  private sample(e: PointerEvent): void {
    const stroke = this.stroke!;
    const canvas = this.ctx.stage.renderer.domElement;
    const ndc = canvasNdc(this.ctx.stage, e.clientX, e.clientY);
    const pixel: Point2 = [((ndc.x + 1) / 2) * canvas.clientWidth, ((1 - ndc.y) / 2) * canvas.clientHeight];
    const last = stroke.pixels[stroke.pixels.length - 1];

    if (last && Math.hypot(pixel[0] - last[0], pixel[1] - last[1]) < SAMPLE_PX) return;

    stroke.ndc.push(ndc);
    stroke.pixels.push(pixel);
  }

  private schedule(): void {
    if (this.frame) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.update();
    });
  }

  private update(): void {
    const stroke = this.stroke;

    if (!stroke?.ndc.length) return;

    this.probe(stroke, stroke.ndc[stroke.ndc.length - 1]);
    this.layer.preview(this.worldPoints(stroke, stroke.ndc), this.ctx.props().markColor ?? DEFAULT_MARK_COLOR);
    this.ctx.loop.invalidate();
  }

  private probe(stroke: Stroke, ndc: THREE.Vector2): void {
    const { stage } = this.ctx;

    this.raycaster.setFromCamera(ndc, stage.camera);

    const hit = this.raycaster.intersectObjects(partMeshes(stage), false)[0];
    const id = hitPartId(hit ?? null);

    if (!hit || !id) return;

    stroke.crossed.add(id);
    stroke.depth = Math.min(stroke.depth ?? Infinity, this.depthOf(hit.point));
  }

  private depthOf(point: THREE.Vector3): number {
    const { camera } = this.ctx.stage;

    return point.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()));
  }

  private worldPoints(stroke: Stroke, ndc: THREE.Vector2[]): THREE.Vector3[] {
    const { camera, orbit } = this.ctx.stage;
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const depth = stroke.depth ?? Math.max(camera.near * 2, this.depthOf(orbit.target));
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      forward,
      camera.position.clone().addScaledVector(forward, depth),
    );

    return ndc.flatMap((p) => {
      this.raycaster.setFromCamera(p, camera);

      const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());

      return point ? [point] : [];
    });
  }

  private enclosedParts(polygon: Point2[]): string[] {
    const { camera, renderer } = this.ctx.stage;
    const canvas = renderer.domElement;
    const box = new THREE.Box3();
    const center = new THREE.Vector3();

    return this.ctx.layer.objects().flatMap(([id, object]) => {
      if (!object.visible || box.setFromObject(object).isEmpty()) return [];

      box.getCenter(center).project(camera);

      const pixel: Point2 = [((center.x + 1) / 2) * canvas.clientWidth, ((1 - center.y) / 2) * canvas.clientHeight];

      return center.z < 1 && pointInPolygon(pixel, polygon) ? [id] : [];
    });
  }
}
