import * as THREE from 'three';
import type { FloorPoint } from '../../cameras/mat/tag36h11';

export interface MatTrackMarker {
  x: number;
  z: number;
  yaw: number;
}

export interface MatTrackOverlay {
  marker: MatTrackMarker | null;
  real: Array<FloorPoint | null>;
  sim: Array<FloorPoint | null>;
}

const TRACK_ORDER = 1042;
const ACCENT = '#0d99ff';
const SIM_GREY = '#8a8a8a';
const LIFT_MM = 3;
const RING_RADIUS_MM = 30;
const RING_SEGMENTS = 48;
const TICK_MM = 30;
const START_SEGMENTS = 1024;
const FLOATS_PER_SEGMENT = 6;

function overlayLine(geometry: THREE.BufferGeometry, color: string) {
  const material = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false });
  const line = new THREE.LineSegments(geometry, material);

  line.renderOrder = TRACK_ORDER;
  line.frustumCulled = false;
  line.visible = false;
  line.raycast = () => {};

  return line;
}

function markerGeometry(): THREE.BufferGeometry {
  const points: number[] = [];

  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    const b = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;

    points.push(Math.sin(a) * RING_RADIUS_MM, 0, Math.cos(a) * RING_RADIUS_MM);
    points.push(Math.sin(b) * RING_RADIUS_MM, 0, Math.cos(b) * RING_RADIUS_MM);
  }

  points.push(0, 0, RING_RADIUS_MM, 0, 0, RING_RADIUS_MM + TICK_MM);

  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

class PathLine {
  private readonly line: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  private buffer = new Float32Array(START_SEGMENTS * FLOATS_PER_SEGMENT);

  private length = 0;

  constructor(overlays: THREE.Group, color: string) {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(this.buffer, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.line = overlayLine(geometry, color);
    overlays.add(this.line);
  }

  private reserve(floats: number): boolean {
    if (floats <= this.buffer.length) return false;

    this.buffer = new Float32Array(floats * 2);
    this.line.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.buffer, 3).setUsage(THREE.DynamicDrawUsage),
    );

    return true;
  }

  private put(at: number, point: FloorPoint): boolean {
    const { buffer } = this;
    const same =
      buffer[at] === Math.fround(point[0]) && buffer[at + 1] === LIFT_MM && buffer[at + 2] === Math.fround(point[1]);

    buffer[at] = point[0];
    buffer[at + 1] = LIFT_MM;
    buffer[at + 2] = point[1];

    return !same;
  }

  set(points: Array<FloorPoint | null>): boolean {
    let changed = this.reserve(points.length * FLOATS_PER_SEGMENT);
    let at = 0;

    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];

      if (!from || !to) continue;

      changed = this.put(at, from) || changed;
      changed = this.put(at + 3, to) || changed;
      at += FLOATS_PER_SEGMENT;
    }

    if (!changed && at === this.length) return false;

    this.length = at;
    this.upload();

    return true;
  }

  private upload() {
    const position = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;

    position.clearUpdateRanges();
    position.addUpdateRange(0, this.length);
    position.needsUpdate = true;
    this.line.geometry.setDrawRange(0, this.length / 3);
    this.line.visible = this.length > 0;
  }

  dispose() {
    this.line.removeFromParent();
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}

export class MatTrack {
  private readonly marker: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  private readonly real: PathLine;

  private readonly sim: PathLine;

  constructor(overlays: THREE.Group) {
    this.marker = overlayLine(markerGeometry(), ACCENT);
    overlays.add(this.marker);
    this.sim = new PathLine(overlays, SIM_GREY);
    this.real = new PathLine(overlays, ACCENT);
  }

  private place(marker: MatTrackMarker | null): boolean {
    const shown = this.marker;

    if (!marker) {
      const was = shown.visible;

      shown.visible = false;

      return was;
    }

    const same =
      shown.visible &&
      shown.position.x === marker.x &&
      shown.position.z === marker.z &&
      shown.rotation.y === marker.yaw;

    shown.position.set(marker.x, LIFT_MM, marker.z);
    shown.rotation.set(0, marker.yaw, 0);
    shown.visible = true;

    return !same;
  }

  set(track: MatTrackOverlay | null): boolean {
    const marker = this.place(track?.marker ?? null);
    const sim = this.sim.set(track?.sim ?? []);
    const real = this.real.set(track?.real ?? []);

    return marker || sim || real;
  }

  dispose(): void {
    this.marker.removeFromParent();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
    this.sim.dispose();
    this.real.dispose();
  }
}
