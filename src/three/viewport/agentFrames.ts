import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { AgentFrame } from './types';
import type { ViewportContext } from './viewportContext';

const FRAME_ORDER = 1050;
const CORNER_SHARE = 0.22;
const PAD_SHARE = 0.04;
const MIN_PAD_MM = 2;
const SAME_MM = 0.01;

const STYLES: Record<AgentFrame['emphasis'], { width: number; opacity: number; outline: number }> = {
  focus: { width: 2.5, opacity: 1, outline: 0.3 },
  normal: { width: 2, opacity: 0.85, outline: 0 },
  dim: { width: 1.5, opacity: 0.3, outline: 0 },
};

interface Entry {
  frame: AgentFrame;
  corners: LineSegments2;
  outline: LineSegments2 | null;
  box: THREE.Box3;
}

function frameLine(color: string, width: number, opacity: number): LineSegments2 {
  const material = new LineMaterial({
    color,
    linewidth: width,
    opacity,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new LineSegments2(new LineSegmentsGeometry(), material);

  line.renderOrder = FRAME_ORDER;
  line.frustumCulled = false;
  line.raycast = () => {};
  line.onBeforeRender = (renderer) => renderer.getSize(material.resolution);

  return line;
}

const CORNERS: Array<[boolean, boolean, boolean]> = [false, true].flatMap((x) =>
  [false, true].flatMap((y) => [false, true].map((z): [boolean, boolean, boolean] => [x, y, z])),
);

const pick = (box: THREE.Box3, axis: 'x' | 'y' | 'z', high: boolean) => (high ? box.max[axis] : box.min[axis]);

function cornerSegments(box: THREE.Box3): number[] {
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(CORNER_SHARE);

  return CORNERS.flatMap(([hx, hy, hz]) => {
    const x = pick(box, 'x', hx);
    const y = pick(box, 'y', hy);
    const z = pick(box, 'z', hz);
    const dx = hx ? -size.x : size.x;
    const dy = hy ? -size.y : size.y;
    const dz = hz ? -size.z : size.z;

    return [x, y, z, x + dx, y, z, x, y, z, x, y + dy, z, x, y, z, x, y, z + dz];
  });
}

function edgeSegments(box: THREE.Box3): number[] {
  return CORNERS.flatMap(([hx, hy, hz]) => {
    const from = [pick(box, 'x', hx), pick(box, 'y', hy), pick(box, 'z', hz)];
    const ends: number[][] = [];

    if (!hx) ends.push([box.max.x, from[1], from[2]]);

    if (!hy) ends.push([from[0], box.max.y, from[2]]);

    if (!hz) ends.push([from[0], from[1], box.max.z]);

    return ends.flatMap((end) => [...from, ...end]);
  });
}

function paddedBounds(objects: THREE.Object3D[]): THREE.Box3 {
  const box = new THREE.Box3();

  objects.forEach((object) => box.expandByObject(object));

  if (box.isEmpty()) return box;

  const size = box.getSize(new THREE.Vector3());

  return box.expandByScalar(Math.max(MIN_PAD_MM, Math.max(size.x, size.y, size.z) * PAD_SHARE));
}

const sameBox = (a: THREE.Box3, b: THREE.Box3) =>
  a.isEmpty() === b.isEmpty() &&
  (a.isEmpty() || (a.min.distanceTo(b.min) < SAME_MM && a.max.distanceTo(b.max) < SAME_MM));

function disposeLine(line: LineSegments2 | null): void {
  if (!line) return;

  line.removeFromParent();
  line.geometry.dispose();
  line.material.dispose();
}

export class AgentFrames {
  private readonly group = new THREE.Group();

  private readonly entries: Entry[] = [];

  private signature = '';

  private readonly ctx: ViewportContext;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.group.name = 'agent-frames';
    ctx.stage.overlays.add(this.group);
  }

  sync(frames: AgentFrame[]): void {
    const signature = frames.map((f) => `${f.key}|${f.color}|${f.emphasis}|${f.partIds.join(',')}`).join(';');

    if (signature === this.signature) return;

    this.signature = signature;
    this.clear();
    frames.forEach((frame) => this.entries.push(this.create(frame)));
    this.refresh();
  }

  refresh(): boolean {
    return this.entries.map((entry) => this.place(entry)).some(Boolean);
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private create(frame: AgentFrame): Entry {
    const style = STYLES[frame.emphasis];
    const corners = frameLine(frame.color, style.width, style.opacity);
    const outline = style.outline ? frameLine(frame.color, 1, style.outline) : null;

    corners.visible = false;
    this.group.add(corners);

    if (outline) {
      outline.visible = false;
      this.group.add(outline);
    }

    return { frame, corners, outline, box: new THREE.Box3() };
  }

  private place(entry: Entry): boolean {
    const objects = entry.frame.partIds.flatMap((id) => this.ctx.layer.get(id) ?? []);
    const box = paddedBounds(objects);

    if (sameBox(box, entry.box)) return false;

    entry.box = box;
    entry.corners.visible = !box.isEmpty();

    if (entry.outline) entry.outline.visible = !box.isEmpty();

    if (box.isEmpty()) return true;

    entry.corners.geometry.setPositions(cornerSegments(box));
    entry.outline?.geometry.setPositions(edgeSegments(box));

    return true;
  }

  private clear(): void {
    this.entries.forEach((entry) => {
      disposeLine(entry.corners);
      disposeLine(entry.outline);
    });
    this.entries.length = 0;
  }
}
