import * as THREE from 'three';
import { THEME_COLORS } from '../../design-system/theme';

export interface PortDot {
  at: [number, number, number];
  hot: boolean;
}

const DOT_PX = 10;

const VERTEX = `
attribute float hot;
uniform float size;
varying float vHot;

void main() {
  vHot = hot;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (1.0 + hot * 0.4);
}
`;

const FRAGMENT = `
uniform vec3 fill;
uniform vec3 hotFill;
uniform vec3 ring;
varying float vHot;

void main() {
  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;

  if (r > 1.0) discard;

  vec3 inner = mix(fill, hotFill, vHot);

  gl_FragColor = vec4(r > 0.62 ? ring : inner, 1.0);
}
`;

export class PortDots {
  private readonly points: THREE.Points;

  private readonly geometry = new THREE.BufferGeometry();

  private readonly material: THREE.ShaderMaterial;

  private readonly pixelRatio: () => number;

  private capacity = 0;

  constructor(overlays: THREE.Group, pixelRatio: () => number) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        size: { value: DOT_PX * pixelRatio() },
        fill: { value: new THREE.Color(THEME_COLORS.gizmoActive) },
        hotFill: { value: new THREE.Color(THEME_COLORS.figmaBlue) },
        ring: { value: new THREE.Color(THEME_COLORS.canvasBg) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'port-dots';
    this.points.frustumCulled = false;
    this.points.renderOrder = 1000;
    this.points.visible = false;
    this.pixelRatio = pixelRatio;
    overlays.add(this.points);
  }

  show(dots: PortDot[]): void {
    if (!dots.length) {
      this.hide();

      return;
    }

    this.reserve(dots.length);

    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const hot = this.geometry.getAttribute('hot') as THREE.BufferAttribute;

    dots.forEach((dot, i) => {
      position.setXYZ(i, ...dot.at);
      hot.setX(i, dot.hot ? 1 : 0);
    });
    position.needsUpdate = true;
    hot.needsUpdate = true;
    this.geometry.setDrawRange(0, dots.length);
    this.material.uniforms.size.value = DOT_PX * this.pixelRatio();
    this.points.visible = true;
  }

  hide(): void {
    this.points.visible = false;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private reserve(count: number): void {
    if (count <= this.capacity) return;

    this.capacity = Math.max(count, this.capacity * 2, 32);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3));
    this.geometry.setAttribute('hot', new THREE.BufferAttribute(new Float32Array(this.capacity), 1));
  }
}
