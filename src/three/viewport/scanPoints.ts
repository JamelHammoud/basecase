import * as THREE from 'three';

const SCAN_ORDER = 1041;
const COLOR = '#0d99ff';
const SIZE_PX = 3;
const START_POINTS = 1024;

export class ScanPoints {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  private buffer = new Float32Array(START_POINTS * 3);

  private count = 0;

  constructor(overlays: THREE.Group) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      color: COLOR,
      size: SIZE_PX,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(this.buffer, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(geometry, material);
    this.points.renderOrder = SCAN_ORDER;
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.raycast = () => {};
    overlays.add(this.points);
  }

  get size(): number {
    return this.count;
  }

  set(points: Float32Array | null): void {
    const { geometry } = this.points;

    this.count = points ? Math.floor(points.length / 3) : 0;

    if (points && points.length > this.buffer.length) {
      this.buffer = new Float32Array(points.length * 2);
      geometry.setAttribute('position', new THREE.BufferAttribute(this.buffer, 3).setUsage(THREE.DynamicDrawUsage));
    }

    if (points) this.buffer.set(points);

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;

    position.clearUpdateRanges();
    position.addUpdateRange(0, this.count * 3);
    position.needsUpdate = true;
    geometry.setDrawRange(0, this.count);
    this.points.visible = this.count > 0;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
