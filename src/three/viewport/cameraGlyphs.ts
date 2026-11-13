import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { FixedCamera } from '../../cameras/fixed';
import { lensDirection, type Dir } from '../../cameras/lens';

const GLYPH_ORDER = 1040;
const LENGTH_SHARE = 0.06;
const MIN_LENGTH_MM = 40;
const MAX_LENGTH_MM = 400;
const ASPECT = 4 / 3;
const COLOR = '#d4d4d4';
const WIDTH_PX = 1.5;
const OPACITY = 0.8;

const EDGE_POINTS: Array<[number, number]> = [
  [-1, 1 / ASPECT],
  [1, 1 / ASPECT],
  [1, -1 / ASPECT],
  [-1, -1 / ASPECT],
];

function rayEnds(camera: FixedCamera): Dir[] {
  return EDGE_POINTS.map(([u, v]) => {
    const point: [number, number] = [u, v * ASPECT];
    const dir = lensDirection(camera.lens, point, ASPECT) ?? lensDirection(camera.lens, [u * 0.7, v * 0.7], ASPECT);

    return dir ?? [0, 0, -1];
  });
}

function frustumSegments(camera: FixedCamera, length: number): number[] {
  const basis = new THREE.Matrix4().lookAt(
    new THREE.Vector3(...camera.position),
    new THREE.Vector3(...camera.target),
    new THREE.Vector3(0, 1, 0),
  );
  const origin = new THREE.Vector3(...camera.position);
  const corners = rayEnds(camera).map((d) =>
    new THREE.Vector3(...d)
      .divideScalar(Math.max(0.2, -d[2]))
      .multiplyScalar(length * 0.6)
      .applyMatrix4(basis)
      .add(origin),
  );
  const out: number[] = [];

  corners.forEach((c, i) => {
    const next = corners[(i + 1) % corners.length];

    out.push(...origin.toArray(), ...c.toArray(), ...c.toArray(), ...next.toArray());
  });

  return out;
}

function glyphLine(): LineSegments2 {
  const material = new LineMaterial({
    color: COLOR,
    linewidth: WIDTH_PX,
    opacity: OPACITY,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new LineSegments2(new LineSegmentsGeometry(), material);

  line.renderOrder = GLYPH_ORDER;
  line.frustumCulled = false;
  line.raycast = () => {};
  line.onBeforeRender = (renderer) => renderer.getSize(material.resolution);

  return line;
}

export class CameraGlyphs {
  private readonly lines = new Map<string, { camera: FixedCamera; line: LineSegments2 }>();

  private readonly overlays: THREE.Group;

  constructor(overlays: THREE.Group) {
    this.overlays = overlays;
  }

  sync(cameras: FixedCamera[] = [], sceneRadiusMm = 500): void {
    const keep = new Set(cameras.map((c) => c.id));

    for (const [id, entry] of this.lines) {
      if (keep.has(id)) continue;

      this.disposeLine(entry.line);
      this.lines.delete(id);
    }

    const length = Math.min(MAX_LENGTH_MM, Math.max(MIN_LENGTH_MM, sceneRadiusMm * LENGTH_SHARE));

    for (const camera of cameras) {
      const entry = this.lines.get(camera.id) ?? { camera, line: glyphLine() };

      entry.camera = camera;
      entry.line.geometry.setPositions(frustumSegments(camera, length));
      this.overlays.add(entry.line);
      this.lines.set(camera.id, entry);
    }
  }

  dispose(): void {
    this.lines.forEach((entry) => this.disposeLine(entry.line));
    this.lines.clear();
  }

  private disposeLine(line: LineSegments2): void {
    line.removeFromParent();
    line.geometry.dispose();
    line.material.dispose();
  }
}
