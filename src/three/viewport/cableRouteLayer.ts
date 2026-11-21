import type { WiringScene } from '../../wiring/connectors';
import * as THREE from 'three';
import { projectPoints } from './measurements';
import { rayAt } from './picking';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

export interface CableRouteView {
  key: string;
  source: WiringScene;
  cancel: () => void;
  points: Vec3[];
  anchors: Vec3[];
  endpoints: Array<{ at: Vec3; name: string }>;
  move: (index: number, point: Vec3, live: boolean) => void;
}

interface Drag {
  key: string;
  index: number;
  pointer: number;
  plane: THREE.Plane;
  point: Vec3;
}

function sameRouteSource(before: CableRouteView | null, after: CableRouteView | null) {
  if (!before || !after) return before === after;

  return (
    before.key === after.key &&
    before.source.parts === after.source.parts &&
    before.source.project.wiring === after.source.project.wiring &&
    before.source.project.joints === after.source.project.joints &&
    before.source.project.pose === after.source.project.pose
  );
}

export class CableRouteLayer {
  private readonly line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x0d99ff,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  private readonly points = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      color: 0x0d99ff,
      size: 12,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  private labels: HTMLElement[] = [];

  private view: CableRouteView | null = null;

  private drag: Drag | null = null;

  private readonly ctx: ViewportContext;

  private readonly root: () => HTMLElement | null;

  constructor(ctx: ViewportContext, root: () => HTMLElement | null) {
    this.ctx = ctx;
    this.root = root;
    this.line.renderOrder = 1070;
    this.points.renderOrder = 1071;
    this.line.raycast = this.points.raycast = () => {};
    ctx.stage.overlays.add(this.line, this.points);
    ctx.loop.afterRender.add(this.placeLabels);
    this.sync(null);
  }

  sync(view: CableRouteView | null): void {
    if (this.drag && !sameRouteSource(this.view, view)) {
      this.view?.cancel();
      this.release();
    }

    this.view = view;
    this.line.visible = this.points.visible = !!view;
    this.line.geometry.dispose();
    this.points.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(
      (view?.points ?? []).map((p) => new THREE.Vector3(...p)),
    );
    this.points.geometry = new THREE.BufferGeometry().setFromPoints(
      (view?.anchors ?? []).map((p) => new THREE.Vector3(...p)),
    );
    this.labels.forEach((label) => label.remove());
    this.labels = (view?.endpoints ?? []).map(({ name }) => {
      const label = document.createElement('div');

      label.className =
        'absolute left-0 top-0 glass rounded-lg px-3 py-2 text-[13px] text-white/90 whitespace-nowrap pointer-events-none';
      label.textContent = name;
      label.dataset.cableEndpoint = '';

      return label;
    });
  }

  install() {
    const canvas = this.ctx.stage.renderer.domElement;
    const down = (event: PointerEvent) => this.down(event);
    const move = (event: PointerEvent) => this.move(event);
    const up = (event: PointerEvent) => {
      const drag = this.drag;

      if (!drag || event.pointerId !== drag.pointer) return;

      event.stopImmediatePropagation();
      this.release();
      this.view?.move(drag.index, drag.point, false);
    };
    const cancel = () => {
      this.view?.cancel();
      this.release();
    };

    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true);
    canvas.addEventListener('pointercancel', cancel, true);

    return () => {
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true);
    };
  }

  dispose() {
    this.release();
    this.labels.forEach((label) => label.remove());
    this.line.removeFromParent();
    this.points.removeFromParent();
    this.line.geometry.dispose();
    this.line.material.dispose();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.ctx.loop.afterRender.delete(this.placeLabels);
  }

  private release() {
    if (!this.drag) return;

    const pointer = this.drag?.pointer;

    this.drag = null;
    this.ctx.stage.orbit.enabled = true;

    const canvas = this.ctx.stage.renderer.domElement;

    if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }

  private down(event: PointerEvent) {
    if (event.button !== 0 || !this.view) return;

    const rect = this.ctx.stage.container.getBoundingClientRect();
    const index = projectPoints(this.ctx, this.view.anchors).findIndex(
      (point) =>
        point.visible && Math.hypot(point.x + rect.left - event.clientX, point.y + rect.top - event.clientY) < 12,
    );

    if (index < 0) return;

    event.stopImmediatePropagation();
    event.preventDefault();

    const at = this.view.anchors[index];
    const normal = this.ctx.stage.camera.getWorldDirection(new THREE.Vector3());

    this.drag = {
      key: this.view.key,
      index,
      pointer: event.pointerId,
      point: at,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...at)),
    };
    this.ctx.stage.orbit.enabled = false;
    this.ctx.stage.renderer.domElement.setPointerCapture(event.pointerId);
  }

  private move(event: PointerEvent) {
    const drag = this.drag;

    if (!drag || event.pointerId !== drag.pointer) return;

    event.stopImmediatePropagation();

    const at = rayAt(this.ctx.stage, event.clientX, event.clientY).ray.intersectPlane(drag.plane, new THREE.Vector3());

    if (!at) return;

    drag.point = at.toArray() as Vec3;
    this.view?.move(drag.index, drag.point, true);
  }

  private readonly placeLabels = () => {
    const root = this.root();
    const projected = projectPoints(this.ctx, this.view?.endpoints.map((endpoint) => endpoint.at) ?? []);

    this.labels.forEach((label, index) => {
      const point = projected[index];

      if (root && label.parentElement !== root) root.append(label);

      label.style.visibility = point?.visible ? 'visible' : 'hidden';
      label.style.transform = `translate(${point?.x ?? 0}px, ${point?.y ?? 0}px) translate(-50%, -140%)`;
    });
  };
}
