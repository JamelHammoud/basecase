import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { SceneMark } from '../../types/robotics';
import { markColorOf } from '../../utils/markColors';
import { MarkLabel } from './markLabel';
import { distanceToPolyline, type Point2 } from './markMath';

const MARK_WIDTH_PX = 3.5;
const HALO_WIDTH_PX = 8;
const HALO_COLOR = '#0d99ff';
const LABEL_HEADROOM = 0.15;
const MARK_ORDER = 1100;
const HIT_PX = 10;

interface LineStyle {
  color: string;
  width: number;
  order?: number;
}

function markLine(points: ArrayLike<number>, style: LineStyle): Line2 {
  const geometry = new LineGeometry();
  const material = new LineMaterial({
    color: style.color,
    linewidth: style.width,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const line = new Line2(geometry, material);

  geometry.setPositions(Array.from(points));
  line.computeLineDistances();
  line.renderOrder = style.order ?? MARK_ORDER;
  line.frustumCulled = false;
  line.raycast = () => {};
  line.onBeforeRender = (renderer) => renderer.getSize(material.resolution);

  return line;
}

function disposeLine(line: Line2 | null): void {
  if (!line) return;

  line.removeFromParent();
  line.geometry.dispose();
  line.material.dispose();
}

const flat = (points: SceneMark['points']) => points.flat();

interface Entry {
  mark: SceneMark;
  points: THREE.Vector3[];
  line: Line2;
  label: MarkLabel | null;
  halo: Line2 | null;
}

export class MarkLayer {
  readonly group = new THREE.Group();

  private readonly entries = new Map<string, Entry>();

  private draft: Line2 | null = null;

  private readonly overlays: THREE.Group;

  constructor(scene: THREE.Scene, overlays: THREE.Group) {
    this.group.name = 'marks';
    this.overlays = overlays;
    scene.add(this.group);
  }

  bounds(): THREE.Box3 {
    const box = new THREE.Box3();

    this.entries.forEach((entry) => entry.points.forEach((p) => box.expandByPoint(p)));

    if (box.isEmpty()) return box;

    return box.expandByVector(box.getSize(new THREE.Vector3()).multiplyScalar(LABEL_HEADROOM));
  }

  sync(marks: SceneMark[] = [], selectedId: string | null = null): void {
    const byId = new Map(marks.map((m) => [m.id, m]));

    for (const [id, entry] of this.entries) {
      if (entry.mark === byId.get(id)) continue;

      this.disposeEntry(entry);
      this.entries.delete(id);
    }

    marks.forEach((mark) => this.ensure(mark));
    this.entries.forEach((entry, id) => this.setHalo(entry, id === selectedId));
  }

  preview(points: THREE.Vector3[] | null, color: string): void {
    disposeLine(this.draft);
    this.draft = null;

    if (!points || points.length < 2) return;

    this.draft = markLine(
      points.flatMap((p) => [p.x, p.y, p.z]),
      { color, width: MARK_WIDTH_PX },
    );
    this.group.add(this.draft);
  }

  hitTest(pixel: Point2, camera: THREE.Camera, size: { width: number; height: number }): string | null {
    let best: { id: string; distance: number } | null = null;
    const projected = new THREE.Vector3();
    const toPixel = (p: THREE.Vector3): Point2 => {
      projected.copy(p).project(camera);

      return [((projected.x + 1) / 2) * size.width, ((1 - projected.y) / 2) * size.height];
    };

    for (const [id, entry] of this.entries) {
      const distance = this.labelHit(entry, pixel) ? 0 : distanceToPolyline(pixel, entry.points.map(toPixel));

      if (distance <= HIT_PX && (!best || distance < best.distance)) best = { id, distance };
    }

    return best?.id ?? null;
  }

  dispose(): void {
    this.preview(null, '');
    this.entries.forEach((entry) => this.disposeEntry(entry));
    this.entries.clear();
    this.group.removeFromParent();
  }

  private ensure(mark: SceneMark): void {
    if (this.entries.has(mark.id) || mark.points.length < 2) return;

    const color = markColorOf(mark);
    const points = mark.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const line = markLine(flat(mark.points), { color, width: MARK_WIDTH_PX });
    const label = mark.label?.trim() ? new MarkLabel(mark.label.trim(), color, points) : null;

    this.group.add(line);

    if (label) this.group.add(label.sprite);

    this.entries.set(mark.id, { mark, points, line, label, halo: null });
  }

  private setHalo(entry: Entry, on: boolean): void {
    if (on === Boolean(entry.halo)) return;

    disposeLine(entry.halo);
    entry.halo = null;

    if (!on) return;

    entry.halo = markLine(flat(entry.mark.points), { color: HALO_COLOR, width: HALO_WIDTH_PX, order: MARK_ORDER - 1 });
    this.overlays.add(entry.halo);
  }

  private labelHit(entry: Entry, [x, y]: Point2): boolean {
    const rect = entry.label?.hitRect();

    return Boolean(rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
  }

  private disposeEntry(entry: Entry): void {
    disposeLine(entry.line);
    disposeLine(entry.halo);
    entry.label?.dispose();
  }
}
