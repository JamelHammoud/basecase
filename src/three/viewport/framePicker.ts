import * as THREE from 'three';
import type { FrameAxes } from '../../dataLayers/draw';
import type { Stage } from './stage';

const REACH_PX = 12;

export class FramePicker {
  private readonly point = new THREE.Vector3();
  x = 0;
  y = 0;

  pick(frames: FrameAxes[], stage: Stage, pointer: { x: number; y: number }): number {
    const { container, renderer, camera } = stage;
    const canvas = renderer.domElement;
    const offsetX = (canvas.clientWidth - container.clientWidth) / 2;
    const offsetY = (canvas.clientHeight - container.clientHeight) / 2;
    let best = -1;
    let bestDistance = REACH_PX;

    for (let i = 0; i < frames.length; i++) {
      const matrix = frames[i].matrix.elements;

      this.point.set(matrix[12], matrix[13], matrix[14]).project(camera);

      const x = (this.point.x * 0.5 + 0.5) * canvas.clientWidth - offsetX;
      const y = (-this.point.y * 0.5 + 0.5) * canvas.clientHeight - offsetY;
      const distance = Math.hypot(x - pointer.x, y - pointer.y);

      if (this.point.z > -1 && this.point.z < 1 && distance <= bestDistance) {
        best = i;
        bestDistance = distance;
        this.x = x;
        this.y = y;
      }
    }

    return best;
  }
}
