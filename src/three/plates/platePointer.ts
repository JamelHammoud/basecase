import * as THREE from 'three';

export class PlatePointer {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly bed = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect'>;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect'>, camera: THREE.PerspectiveCamera) {
    this.canvas = canvas;
    this.camera = camera;
  }

  ray(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.canvas.getBoundingClientRect();

    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);

    return this.raycaster;
  }

  bedPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    return this.ray(clientX, clientY).ray.intersectPlane(this.bed, new THREE.Vector3());
  }
}
