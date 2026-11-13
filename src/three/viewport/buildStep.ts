import * as THREE from 'three';
import { projectPoints } from './measurements';
import type { BuildStepView, Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

const HOLD_MS = 450;
const MOVE_MS = 900;
const ARROW_COLOR = 0x0d99ff;
const ARROW_ORDER = 20;
const LABEL_GAP_PX = 8;
const LABEL_CLASS =
  'absolute left-0 top-0 glass rounded-full h-8 px-3.5 flex items-center whitespace-nowrap text-[13px] text-white/90 tabular-nums pointer-events-none';
const UP = new THREE.Vector3(0, 1, 0);
const BOX = new THREE.Box3();

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

interface Label {
  partId: string;
  element: HTMLElement;
}

function arrowObject(from: Vec3, to: Vec3, material: THREE.Material): THREE.Object3D {
  const start = new THREE.Vector3(...from);
  const dir = new THREE.Vector3(...to).sub(start);
  const length = dir.length();
  const arrow = new THREE.Group();

  if (length < 1e-3) return arrow;

  const head = THREE.MathUtils.clamp(length * 0.22, 2.5, 12);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(head * 0.16, head * 0.16, length - head, 10), material);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(head * 0.42, head, 18), material);

  shaft.position.y = (length - head) / 2;
  cone.position.y = length - head / 2;
  shaft.renderOrder = cone.renderOrder = ARROW_ORDER;
  arrow.add(shaft, cone);
  arrow.position.copy(start);
  arrow.quaternion.setFromUnitVectors(UP, dir.normalize());

  return arrow;
}

function labelElement(text: string): HTMLElement {
  const element = document.createElement('div');

  element.className = LABEL_CLASS;
  element.textContent = text;
  element.dataset.buildLabel = '';
  element.style.visibility = 'hidden';

  return element;
}

export class BuildStepLayer {
  private view: BuildStepView | null = null;

  private shown = new Set<string>();

  private readonly hidden = new Set<THREE.Object3D>();

  private readonly pose = new Map<string, THREE.Matrix4>();

  private started = 0;

  private moving = false;

  private labels: Label[] = [];

  private readonly arrows = new THREE.Group();

  private readonly material = new THREE.MeshBasicMaterial({
    color: ARROW_COLOR,
    depthTest: false,
    transparent: true,
    toneMapped: false,
  });

  private readonly ctx: ViewportContext;

  private readonly labelRoot: () => HTMLElement | null;

  constructor(ctx: ViewportContext, labelRoot: () => HTMLElement | null) {
    this.ctx = ctx;
    this.labelRoot = labelRoot;
    this.arrows.name = 'build-step-arrows';
    ctx.stage.overlays.add(this.arrows);
    ctx.loop.animators.add(this.animate);
    ctx.loop.afterRender.add(this.placeLabels);
  }

  show(view: BuildStepView | null): void {
    const entering = !this.view;

    this.view = view;
    this.clearOverlay();

    if (!view) {
      this.leave();

      return;
    }

    if (entering) this.ctx.layer.pose = this.pose;

    this.shown = new Set(view.shown);
    this.pose.clear();
    this.moving = view.moves.length > 0 && !reducedMotion();

    if (this.moving)
      view.moves.forEach((m) => this.pose.set(m.partId, new THREE.Matrix4().makeTranslation(...m.offset)));

    this.started = performance.now();
    view.arrows.forEach((a) => this.arrows.add(arrowObject(a.from, a.to, this.material)));
    this.labels = view.labels.map((l) => ({ partId: l.partId, element: labelElement(l.text) }));
    this.ctx.applyPose();
  }

  reapply(): void {
    if (!this.view) return;

    for (const [id, group] of this.ctx.layer.objects()) {
      const visible = this.shown.has(id);

      if (group.visible === visible) continue;

      group.visible = visible;

      if (visible) this.hidden.delete(group);
      else this.hidden.add(group);
    }
  }

  outlined(selected: string[]): THREE.Object3D[] {
    return this.view ? [] : selected.flatMap((id) => this.ctx.layer.get(id) ?? []);
  }

  shownIds(): string[] {
    return this.ctx.layer.objects().flatMap(([id, group]) => (group.visible ? [id] : []));
  }

  dispose(): void {
    this.clearOverlay();
    this.arrows.removeFromParent();
    this.material.dispose();
    this.ctx.loop.animators.delete(this.animate);
    this.ctx.loop.afterRender.delete(this.placeLabels);
  }

  private leave(): void {
    this.hidden.forEach((group) => (group.visible = true));
    this.hidden.clear();
    this.shown.clear();
    this.pose.clear();
    this.moving = false;
    this.ctx.layer.pose = this.ctx.props().pose ?? new Map();
    this.ctx.applyPose();
  }

  private clearOverlay(): void {
    this.arrows.children.forEach((arrow) => arrow.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));
    this.arrows.clear();
    this.labels.forEach((l) => l.element.remove());
    this.labels = [];
  }

  private readonly animate = (): boolean => {
    const view = this.view;

    if (!this.moving || !view) return false;

    const t = (performance.now() - this.started - HOLD_MS) / MOVE_MS;

    if (t < 0) return false;

    const k = 1 - easeInOutCubic(Math.min(1, t));

    view.moves.forEach(({ partId, offset: [x, y, z] }) => this.pose.get(partId)?.makeTranslation(x * k, y * k, z * k));
    this.ctx.layer.applyPoseTo(view.moves.map((m) => m.partId));
    this.moving = t < 1;

    return true;
  };

  private readonly placeLabels = (): void => {
    const root = this.labelRoot();

    if (!root) return;

    for (const { partId, element } of this.labels) {
      const group = this.ctx.layer.get(partId);
      const box = group ? BOX.setFromObject(group) : null;
      const top: Vec3 | null =
        box && !box.isEmpty() ? [(box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2] : null;
      const [screen] = top ? projectPoints(this.ctx, [top]) : [];

      if (element.parentElement !== root) root.append(element);

      element.style.visibility = screen?.visible ? 'visible' : 'hidden';

      if (screen?.visible)
        element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, calc(-100% - ${LABEL_GAP_PX}px))`;
    }
  };
}
