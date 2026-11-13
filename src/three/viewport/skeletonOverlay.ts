import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { frameBox } from './cameraOps';
import { rayAt } from './picking';
import type { SkeletonView, Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

const SKELETON_ORDER = 1060;
const BALL_PX = 14;
const HIT_PX = 12;
const MOVE_PX = 3;
const BONE_COLOR = '#ffffff';

interface Drag {
  pointerId: number;
  id: string;
  plane: THREE.Plane;
  start: THREE.Vector3;
  pixel: THREE.Vector2;
  moved: boolean;
}

function discTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');

  canvas.width = canvas.height = 64;

  if (g) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

function boneLine(): LineSegments2 {
  const material = new LineMaterial({
    color: BONE_COLOR,
    linewidth: 2,
    opacity: 0.7,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new LineSegments2(new LineSegmentsGeometry(), material);

  line.renderOrder = SKELETON_ORDER;
  line.frustumCulled = false;
  line.raycast = () => {};
  line.onBeforeRender = (renderer) => renderer.getSize(material.resolution);

  return line;
}

function ballPoints(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const material = new THREE.PointsMaterial({
    size: BALL_PX * Math.min(window.devicePixelRatio, 2),
    sizeAttenuation: false,
    vertexColors: true,
    map: discTexture(),
    alphaTest: 0.5,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(new THREE.BufferGeometry(), material);

  points.renderOrder = SKELETON_ORDER + 1;
  points.frustumCulled = false;
  points.raycast = () => {};

  return points;
}

export class SkeletonOverlay {
  private readonly group = new THREE.Group();

  private readonly bones = boneLine();

  private readonly balls = ballPoints();

  private view: SkeletonView | null = null;

  private drag: Drag | null = null;

  private readonly ctx: ViewportContext;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.group.name = 'skeleton';
    this.group.add(this.bones, this.balls);
    this.group.visible = false;
    ctx.stage.overlays.add(this.group);
  }

  sync(view: SkeletonView | null | undefined): void {
    const appeared = !this.view && !!view?.joints.length;

    this.view = view?.joints.length ? view : null;
    this.group.visible = !!this.view;

    if (!this.view) return;

    if (appeared && !this.ctx.props().parts.length) this.frame(this.view);

    const color = new THREE.Color();
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        this.view.joints.flatMap((j) => j.at),
        3,
      ),
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        this.view.joints.flatMap((j) => color.set(j.color).toArray()),
        3,
      ),
    );
    this.balls.geometry.dispose();
    this.balls.geometry = geometry;
    this.bones.visible = this.view.bones.length > 0;

    if (this.bones.visible) this.bones.geometry.setPositions(this.view.bones.flat(2));
  }

  install(): () => void {
    const canvas = this.ctx.stage.renderer.domElement;
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);

    canvas.addEventListener('pointerdown', down, { capture: true });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    return () => {
      canvas.removeEventListener('pointerdown', down, { capture: true });
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }

  dispose(): void {
    this.group.removeFromParent();
    this.bones.geometry.dispose();
    this.bones.material.dispose();
    this.balls.geometry.dispose();
    this.balls.material.map?.dispose();
    this.balls.material.dispose();
  }

  private frame(view: SkeletonView): void {
    const box = new THREE.Box3().setFromPoints(view.joints.map((j) => new THREE.Vector3(...j.at)));

    box.expandByPoint(box.getCenter(new THREE.Vector3()).setY(0));
    frameBox(this.ctx.stage, box);
  }

  private hit(e: Pick<PointerEvent, 'clientX' | 'clientY'>): { id: string; at: THREE.Vector3 } | null {
    const rect = this.ctx.stage.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);
    let best: { id: string; at: THREE.Vector3; px: number } | null = null;

    for (const joint of this.view?.joints ?? []) {
      const at = new THREE.Vector3(...joint.at);
      const ndc = at.clone().project(this.ctx.stage.camera);
      const pixel = new THREE.Vector2(((ndc.x + 1) / 2) * rect.width, ((1 - ndc.y) / 2) * rect.height);
      const px = pixel.distanceTo(pointer);

      if (ndc.z < 1 && px <= HIT_PX && (!best || px < best.px)) best = { id: joint.id, at, px };
    }

    return best;
  }

  private onDown(e: PointerEvent): void {
    const found = e.button === 0 && this.group.visible ? this.hit(e) : null;

    if (!found) return;

    const forward = this.ctx.stage.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, found.at);
    const start = rayAt(this.ctx.stage, e.clientX, e.clientY).ray.intersectPlane(plane, new THREE.Vector3());

    if (!start) return;

    this.ctx.stage.orbit.enabled = false;
    this.ctx.runtime.draggingGizmo = true;
    this.ctx.stage.renderer.domElement.setPointerCapture(e.pointerId);
    this.drag = {
      pointerId: e.pointerId,
      id: found.id,
      plane,
      start,
      pixel: new THREE.Vector2(e.clientX, e.clientY),
      moved: false,
    };
  }

  private onMove(e: PointerEvent): void {
    const drag = this.drag;

    if (!drag) {
      this.hover(e);

      return;
    }

    if (e.pointerId !== drag.pointerId) return;

    const first = !drag.moved;

    drag.moved ||= drag.pixel.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) >= MOVE_PX;

    const point = drag.moved
      ? rayAt(this.ctx.stage, e.clientX, e.clientY).ray.intersectPlane(drag.plane, new THREE.Vector3())
      : null;

    if (!point) return;

    const raw = point.sub(drag.start).toArray() as Vec3;
    const delta = (this.ctx.runtime.shiftHeld ? raw : raw.map(Math.round)) as Vec3;
    const send = this.ctx.props().onSkeletonDrag;

    if (first) send?.({ id: drag.id, delta: [0, 0, 0], phase: 'start', alone: e.altKey });

    send?.({ id: drag.id, delta, phase: 'move', alone: e.altKey });
  }

  private onUp(e: PointerEvent): void {
    const drag = this.drag;

    if (e.pointerId !== drag?.pointerId) return;

    this.drag = null;
    this.ctx.stage.orbit.enabled = true;
    setTimeout(() => (this.ctx.runtime.draggingGizmo = false));

    if (drag.moved) this.ctx.props().onSkeletonDrag?.({ id: drag.id, delta: [0, 0, 0], phase: 'end', alone: false });
    else this.ctx.props().onSkeletonPick?.(drag.id, { x: e.clientX, y: e.clientY });
  }

  private hover(e: PointerEvent): void {
    if (!this.group.visible || e.buttons !== 0) return;

    const canvas = this.ctx.stage.renderer.domElement;
    const over = !!this.hit(e);

    if (over) canvas.style.cursor = 'move';
    else if (canvas.style.cursor === 'move') canvas.style.cursor = '';
  }
}
