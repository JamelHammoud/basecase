import * as THREE from 'three';
import { partMeshes } from './picking';
import type { ViewportContext } from './viewportContext';

interface Drag {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  active: boolean;
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const GRID_STEPS = 6;
const MAX_SAMPLES = 600;

const inside = (rect: Rect, x: number, y: number) =>
  x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;

function rectIn(drag: Drag, origin: DOMRect): Rect {
  return {
    minX: Math.min(drag.x0, drag.x1) - origin.left,
    maxX: Math.max(drag.x0, drag.x1) - origin.left,
    minY: Math.min(drag.y0, drag.y1) - origin.top,
    maxY: Math.max(drag.y0, drag.y1) - origin.top,
  };
}

function meshTouches(mesh: THREE.Mesh, camera: THREE.Camera, canvas: DOMRect, box: Rect): boolean {
  const position = mesh.geometry.getAttribute('position');
  const v = new THREE.Vector3();

  if (!position) {
    return false;
  }

  const stride = Math.max(1, Math.floor(position.count / MAX_SAMPLES));

  for (let i = 0; i < position.count; i += stride) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(camera);

    if (v.z < 1 && inside(box, (v.x * 0.5 + 0.5) * canvas.width, (-v.y * 0.5 + 0.5) * canvas.height)) return true;
  }

  return false;
}

function objectTouches(object: THREE.Object3D, camera: THREE.Camera, canvas: DOMRect, box: Rect): boolean {
  let found = false;

  object.updateWorldMatrix(true, true);
  object.traverse((child) => {
    found ||= child instanceof THREE.Mesh && meshTouches(child, camera, canvas, box);
  });

  return found;
}

export class Marquee {
  private drag: Drag | null = null;

  private readonly ctx: ViewportContext;

  private readonly element: () => HTMLElement | null;

  private readonly hoveringAxis: () => boolean;

  constructor(ctx: ViewportContext, options: { element: () => HTMLElement | null; hoveringAxis: () => boolean }) {
    this.ctx = ctx;
    this.element = options.element;
    this.hoveringAxis = options.hoveringAxis;
  }

  install(): () => void {
    const canvas = this.ctx.stage.renderer.domElement;
    const down = (e: PointerEvent) => this.onDown(e);
    const move = (e: PointerEvent) => this.onMove(e);
    const up = () => this.onUp();

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

  private onDown(e: PointerEvent): void {
    const { annotateMode, measureMode, markMode, transformMode } = this.ctx.props();
    const otherTool = annotateMode || measureMode || markMode || transformMode === 'sculpt';

    if (!e.shiftKey || e.button !== 0 || otherTool || this.hoveringAxis()) {
      return;
    }

    this.ctx.stage.orbit.enabled = false;
    this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, active: false };
    this.ctx.stage.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private onMove(e: PointerEvent): void {
    const drag = this.drag;

    if (!drag) {
      return;
    }

    if (this.ctx.runtime.draggingGizmo) {
      this.drag = null;
      this.draw();

      return;
    }

    drag.x1 = e.clientX;
    drag.y1 = e.clientY;
    drag.active ||= Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) > 5;
    this.draw();
  }

  private onUp(): void {
    const drag = this.drag;

    if (!drag) {
      return;
    }

    this.drag = null;
    this.draw();

    if (!this.ctx.runtime.draggingGizmo) this.ctx.stage.orbit.enabled = true;

    if (drag.active) this.ctx.props().onMarqueeSelect?.(this.hits(drag));
  }

  private draw(): void {
    const el = this.element();
    const drag = this.drag;

    if (!el) {
      return;
    }

    if (!drag?.active) {
      el.style.display = 'none';

      return;
    }

    const box = rectIn(drag, this.ctx.stage.container.getBoundingClientRect());

    el.style.display = 'block';
    el.style.transform = `translate(${box.minX}px, ${box.minY}px)`;
    el.style.width = `${box.maxX - box.minX}px`;
    el.style.height = `${box.maxY - box.minY}px`;
  }

  private selectable(id: string | undefined): boolean {
    const part = id ? this.ctx.layer.part(id) : undefined;

    return Boolean(part && !part.locked && part.visible);
  }

  private hits(drag: Drag): string[] {
    const { camera } = this.ctx.stage;
    const canvas = this.ctx.stage.renderer.domElement.getBoundingClientRect();
    const box = rectIn(drag, canvas);
    const found = new Set<string>();

    for (const [id, object] of this.ctx.layer.objects()) {
      if (this.selectable(id) && objectTouches(object, camera, canvas, box)) found.add(id);
    }

    this.rayGrid(box, canvas).forEach((id) => found.add(id));

    return [...found];
  }

  private rayGrid(box: Rect, canvas: DOMRect): string[] {
    const raycaster = new THREE.Raycaster();
    const meshes = partMeshes(this.ctx.stage);
    const ids: string[] = [];

    for (let gx = 0; gx <= GRID_STEPS; gx++) {
      for (let gy = 0; gy <= GRID_STEPS; gy++) {
        const sx = box.minX + ((box.maxX - box.minX) * gx) / GRID_STEPS;
        const sy = box.minY + ((box.maxY - box.minY) * gy) / GRID_STEPS;

        raycaster.setFromCamera(
          new THREE.Vector2((sx / canvas.width) * 2 - 1, -(sy / canvas.height) * 2 + 1),
          this.ctx.stage.camera,
        );
        raycaster
          .intersectObjects(meshes, false)
          .map((hit) => hit.object.userData.partId as string | undefined)
          .forEach((id) => this.selectable(id) && ids.push(id!));
      }
    }

    return ids;
  }
}
