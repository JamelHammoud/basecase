import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Bed } from '../../print/bed';
import type { PlanItem } from '../../print/plan';
import type { ScenePart } from '../../types/robotics';
import { buildPartGroup, releasePartGroup } from '../buildPartMesh';
import { prepareParts } from '../partMesh/prepare';
import { buildBed, disposeTree, lightScene, plateToScene } from './plateScene';

export interface PlateHit {
  id: string;
  copy: number;
  normal: [number, number, number];
  point: THREE.Vector3;
}

interface Shown {
  item: PlanItem;
  group: THREE.Group;
  base: THREE.Matrix4;
}

const SELECT_COLOR = 0x0d99ff;

export class PlateView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  private controls: OrbitControls;
  private bedGroup: THREE.Group | null = null;
  private bed: Bed | null = null;
  private shown: Shown[] = [];
  private selection: THREE.Box3Helper | null = null;
  private frame = 0;
  private disposeLights: () => void;
  private resize: ResizeObserver;
  private version = 0;

  private canvas: HTMLCanvasElement;

  constructor(container: HTMLElement) {
    const canvas = document.createElement('canvas');

    canvas.className = 'block w-full h-full';
    container.appendChild(canvas);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0x1b1b1b);
    this.disposeLights = lightScene(this.scene, this.renderer);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.invalidate());
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(canvas);
    this.fit();
  }

  private fit() {
    const { clientWidth: w, clientHeight: h } = this.canvas;

    if (!w || !h) return;

    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate() {
    if (this.frame) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  setBed(bed: Bed) {
    const same = this.bed && JSON.stringify(this.bed) === JSON.stringify(bed);

    if (same) return;

    if (this.bedGroup) {
      this.scene.remove(this.bedGroup);
      disposeTree(this.bedGroup);
    }

    this.bed = bed;
    this.bedGroup = buildBed(bed);
    this.scene.add(this.bedGroup);
    this.frameBed();
  }

  frameBed() {
    if (!this.bed) return;

    const { width, depth, height } = this.bed;
    const center = new THREE.Vector3(width / 2, Math.min(height, 60) / 3, -depth / 2);
    const span = Math.max(width, depth);

    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + span * 1.05, center.z + span * 1.25);
    this.camera.lookAt(center);
    this.controls.update();
    this.invalidate();
  }

  private clearParts() {
    for (const s of this.shown) {
      this.scene.remove(s.group);
      releasePartGroup(s.group);
    }

    this.shown = [];
  }

  async showPlate(items: PlanItem[], parts: ScenePart[]) {
    const version = ++this.version;
    const byId = new Map(parts.map((p) => [p.id, p]));
    const used = items.map((it) => byId.get(it.id)).filter((p): p is ScenePart => !!p);

    await prepareParts(used);

    if (version !== this.version || !this.bed) return;

    this.clearParts();

    const toScene = plateToScene(this.bed);

    for (const item of items) {
      const part = byId.get(item.id);

      if (!part) continue;

      const group = buildPartGroup(part, false, { shareGeometry: true });
      const base = toScene.clone().multiply(new THREE.Matrix4().fromArray(item.matrix));

      group.matrixAutoUpdate = false;
      group.matrix.copy(base);
      group.userData.copy = item.copy;
      this.scene.add(group);
      this.shown.push({ item, group, base });
    }

    this.invalidate();
  }

  select(id: string | null) {
    if (this.selection) {
      this.scene.remove(this.selection);
      this.selection.dispose();
      this.selection = null;
    }

    const shown = this.shown.find((s) => s.item.id === id && s.item.copy === 0);

    if (shown) {
      shown.group.updateMatrixWorld(true);
      this.selection = new THREE.Box3Helper(new THREE.Box3().setFromObject(shown.group), SELECT_COLOR);
      this.scene.add(this.selection);
    }

    this.invalidate();
  }

  private ray(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();

    raycaster.setFromCamera(ndc, this.camera);

    return raycaster;
  }

  pick(clientX: number, clientY: number): PlateHit | null {
    const hits = this.ray(clientX, clientY).intersectObjects(
      this.shown.map((s) => s.group),
      true,
    );
    const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh && h.face);
    const shown = hit && this.shown.find((s) => hit.object === s.group || isInside(hit.object, s.group));

    if (!hit?.face || !shown) return null;

    const local = new THREE.Matrix4().copy(shown.group.matrixWorld).invert().multiply(hit.object.matrixWorld);
    const normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(local)).normalize();

    return {
      id: shown.item.id,
      copy: shown.item.copy,
      normal: normal.toArray().map((v) => Math.round(v * 1e5) / 1e5) as [number, number, number],
      point: hit.point,
    };
  }

  bedPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    return this.ray(clientX, clientY).ray.intersectPlane(plane, new THREE.Vector3());
  }

  dragOffset(id: string, dx: number, dz: number) {
    const shown = this.shown.find((s) => s.item.id === id && s.item.copy === 0);

    if (!shown) return;

    shown.group.matrix.copy(new THREE.Matrix4().makeTranslation(dx, 0, dz).multiply(shown.base));
    shown.group.matrixWorldNeedsUpdate = true;
    this.select(id);
  }

  setOrbit(enabled: boolean) {
    this.controls.enabled = enabled;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controls.dispose();
    this.clearParts();
    this.select(null);

    if (this.bedGroup) disposeTree(this.bedGroup);

    this.disposeLights();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

function isInside(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === root) return true;

  return false;
}
