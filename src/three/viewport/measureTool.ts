import * as THREE from 'three';
import { closestOnVertical, formatLength, measureDistance, snapPoint, type LengthPart, type Snap } from './measureMath';
import { projectPoints } from './measurements';
import { floorPoint, partMeshes, rayAt } from './picking';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';

const ACCENT = 0x0d99ff;
const SNAP_PX = 9;
const DOT_PX = 9;
const SNAPPED_DOT_PX = 13;
const OVERLAY_ORDER = 1000;

interface WorldEdges {
  matrix: THREE.Matrix4;
  positions: Float32Array;
}

const toVec3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

function dotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');

  canvas.width = 64;
  canvas.height = 64;

  if (g) {
    g.beginPath();
    g.arc(32, 32, 26, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#0d99ff';
    g.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

function overlay<T extends THREE.Object3D>(object: T): T {
  object.renderOrder = OVERLAY_ORDER;
  object.frustumCulled = false;
  object.raycast = () => {};

  return object;
}

function dots(texture: THREE.Texture, count: number): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.PointsMaterial({
    size: DOT_PX,
    sizeAttenuation: false,
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    toneMapped: false,
  });

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

  return overlay(new THREE.Points(geometry, material));
}

function setPositions(object: THREE.Points | THREE.Line, points: THREE.Vector3[]): void {
  const attribute = object.geometry.getAttribute('position') as THREE.BufferAttribute;

  points.forEach((p, i) => attribute.setXYZ(i, p.x, p.y, p.z));
  attribute.needsUpdate = true;
  object.geometry.setDrawRange(0, points.length);
  object.geometry.computeBoundingSphere();
  object.visible = points.length > 0;
}

function hitSegments(hit: THREE.Intersection, cache: WeakMap<THREE.Object3D, WorldEdges>): ArrayLike<number> {
  const edges = hit.object.getObjectByName('cad-edges') as THREE.LineSegments | undefined;

  if (edges) return worldEdges(edges, cache);

  const mesh = hit.object as THREE.Mesh;
  const position = mesh.geometry?.getAttribute('position');

  if (!hit.face || !position) return [];

  return [hit.face.a, hit.face.b, hit.face.c].flatMap((index) => {
    const v = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);

    return [v.x, v.y, v.z, v.x, v.y, v.z];
  });
}

function worldEdges(edges: THREE.LineSegments, cache: WeakMap<THREE.Object3D, WorldEdges>): Float32Array {
  const cached = cache.get(edges);

  if (cached?.matrix.equals(edges.matrixWorld)) return cached.positions;

  const source = edges.geometry.getAttribute('position');
  const positions = new Float32Array(source.count * 3);
  const v = new THREE.Vector3();

  for (let i = 0; i < source.count; i++) {
    v.fromBufferAttribute(source, i).applyMatrix4(edges.matrixWorld);
    positions.set([v.x, v.y, v.z], i * 3);
  }

  cache.set(edges, { matrix: edges.matrixWorld.clone(), positions });

  return positions;
}

function lengthSpans(part: LengthPart, spaced: boolean): HTMLSpanElement[] {
  const value = document.createElement('span');
  const unit = document.createElement('span');

  value.textContent = `${spaced ? ' ' : ''}${part.value}`;
  value.className = 'text-white/90 font-medium';
  unit.textContent = `\u00a0${part.unit}`;
  unit.className = 'text-white/45';

  return [value, unit];
}

export class MeasureTool {
  readonly group = new THREE.Group();

  private points: THREE.Vector3[] = [];

  private hover: Snap | null = null;

  private pointer: { x: number; y: number } | null = null;

  private frame = 0;

  private readonly edgeCache = new WeakMap<THREE.Object3D, WorldEdges>();

  private readonly texture = dotTexture();

  private readonly line: THREE.Line;

  private readonly placed: THREE.Points;

  private readonly cursor: THREE.Points;

  private readonly ctx: ViewportContext;

  private readonly label: () => HTMLElement | null;

  constructor(ctx: ViewportContext, label: () => HTMLElement | null) {
    this.ctx = ctx;
    this.label = label;

    const lineGeometry = new THREE.BufferGeometry();

    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.line = overlay(
      new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, toneMapped: false }),
      ),
    );
    this.placed = dots(this.texture, 2);
    this.cursor = dots(this.texture, 1);
    this.group.add(this.line, this.placed, this.cursor);
    this.group.name = 'measure';
    ctx.stage.overlays.add(this.group);
    this.draw();
  }

  hoverAt(clientX: number, clientY: number): void {
    this.pointer = { x: clientX, y: clientY };

    if (this.frame) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = 0;

      const pointer = this.pointer;

      this.hover = pointer ? this.pick(pointer.x, pointer.y) : null;
      this.draw();
    });
  }

  refresh(): void {
    if (this.pointer) this.hoverAt(this.pointer.x, this.pointer.y);
  }

  leave(): void {
    this.pointer = null;
    this.hover = null;
    this.draw();
  }

  clickAt(clientX: number, clientY: number): void {
    const snap = this.pick(clientX, clientY);

    if (!snap) return;

    const point = new THREE.Vector3(...snap.point);

    this.points = this.points.length === 1 ? [this.points[0], point] : [point];
    this.draw();
  }

  startAt(clientX: number, clientY: number): void {
    this.points = [];
    this.clickAt(clientX, clientY);
  }

  clear(): boolean {
    const had = this.points.length > 0;

    this.points = [];
    this.hover = null;
    this.draw();

    return had;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.ctx.stage.overlays.remove(this.group);
    [this.line, this.placed, this.cursor].forEach((object) => {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    });
    this.texture.dispose();
  }

  updateLabel(): void {
    const label = this.label();
    const ends = this.ends();

    if (!label) return;

    if (ends.length < 2) {
      label.style.display = 'none';

      return;
    }

    const [a, b] = ends.map(toVec3);
    const mid = new THREE.Vector3().addVectors(ends[0], ends[1]).multiplyScalar(0.5);
    const [screen] = projectPoints(this.ctx, [toVec3(mid)]);

    label.style.display = screen.visible ? 'flex' : 'none';
    label.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, calc(-100% - 10px))`;
    this.fill(label, a, b);
  }

  private fill(label: HTMLElement, a: Vec3, b: Vec3): void {
    const parts = formatLength(measureDistance(a, b), this.ctx.props().measureUnit ?? 'metric');
    const text = parts.map((part) => `${part.value} ${part.unit}`).join(' ');

    if (label.dataset.text === text) return;

    label.dataset.text = text;
    label.replaceChildren(...parts.flatMap((part, i) => lengthSpans(part, i > 0)));
  }

  private ends(): THREE.Vector3[] {
    if (this.points.length !== 1) return this.points;

    return this.hover ? [this.points[0], new THREE.Vector3(...this.hover.point)] : this.points;
  }

  private draw(): void {
    const ends = this.ends();
    const cursorSize = this.hover && this.hover.kind !== 'surface' ? SNAPPED_DOT_PX : DOT_PX;

    setPositions(this.line, ends.length === 2 ? ends : []);
    setPositions(this.placed, this.points);
    setPositions(this.cursor, this.hover ? [new THREE.Vector3(...this.hover.point)] : []);
    (this.cursor.material as THREE.PointsMaterial).size = cursorSize;
    this.updateLabel();
    this.ctx.loop.invalidate();
  }

  private pick(clientX: number, clientY: number): Snap | null {
    const { stage, runtime } = this.ctx;
    const raycaster = rayAt(stage, clientX, clientY);
    const hit = raycaster.intersectObjects(partMeshes(stage), false)[0];
    const surface = hit ? this.snapHit(hit) : null;
    const start = this.points.length === 1 ? toVec3(this.points[0]) : null;

    if (start && runtime.altHeld) return this.vertical(start, surface, raycaster.ray);

    if (surface) return surface;

    const floor = floorPoint(raycaster);

    return floor ? { point: [floor.x, 0, floor.z], kind: 'surface' } : null;
  }

  private snapHit(hit: THREE.Intersection): Snap {
    const point = toVec3(hit.point);

    if (this.ctx.runtime.shiftHeld) return { point, kind: 'surface' };

    return snapPoint(point, hitSegments(hit, this.edgeCache), this.reach(hit.point));
  }

  private vertical(start: Vec3, surface: Snap | null, ray: THREE.Ray): Snap {
    if (surface && surface.kind !== 'surface')
      return { point: [start[0], surface.point[1], start[2]], kind: surface.kind };

    return { point: closestOnVertical(start, toVec3(ray.origin), toVec3(ray.direction)), kind: 'surface' };
  }

  private reach(point: THREE.Vector3): number {
    const { camera, renderer } = this.ctx.stage;
    const height = Math.max(1, renderer.domElement.clientHeight);
    const viewHeight = 2 * camera.position.distanceTo(point) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

    return (viewHeight / height) * SNAP_PX;
  }
}
