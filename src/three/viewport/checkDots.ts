import * as THREE from 'three';
import type { CheckDot } from '../../utils/engineeringTypes';

const DOT_ORDER = 1030;
const SIZE_PX = 5;
const NEUTRAL = new THREE.Color('#8a8a8a');
const ACCENT = new THREE.Color('#0d99ff');

function dotGeometry(dots: CheckDot[]): THREE.BufferGeometry {
  const positions = new Float32Array(dots.length * 3);
  const colors = new Float32Array(dots.length * 3);
  const color = new THREE.Color();

  dots.forEach((dot, i) => {
    positions.set(dot.at, i * 3);
    color.copy(NEUTRAL).lerp(ACCENT, dot.shade);
    colors.set([color.r, color.g, color.b], i * 3);
  });

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return geometry;
}

export class CheckDots {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  private readonly overlays: THREE.Group;

  constructor(overlays: THREE.Group) {
    this.overlays = overlays;
    this.points = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        size: SIZE_PX,
        sizeAttenuation: false,
        vertexColors: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.points.renderOrder = DOT_ORDER;
    this.points.frustumCulled = false;
    this.points.raycast = () => {};
  }

  get count(): number {
    return this.points.parent ? (this.points.geometry.getAttribute('position')?.count ?? 0) : 0;
  }

  sync(dots: CheckDot[] | null | undefined): void {
    this.points.geometry.dispose();
    this.points.geometry = dots?.length ? dotGeometry(dots) : new THREE.BufferGeometry();

    if (dots?.length) this.overlays.add(this.points);
    else this.points.removeFromParent();
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
