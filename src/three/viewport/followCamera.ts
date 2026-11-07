import * as THREE from 'three';
import type { Stage } from './stage';

const CATCH_UP = 0.18;

export class FollowCamera {
  private readonly stage: Stage;

  private readonly objectFor: (id: string) => THREE.Object3D | undefined;

  private readonly tracked = new THREE.Vector3();

  private partId: string | null = null;

  constructor(stage: Stage, objectFor: (id: string) => THREE.Object3D | undefined) {
    this.stage = stage;
    this.objectFor = objectFor;
  }

  get active(): boolean {
    return this.partId !== null;
  }

  follow(partId: string | null): void {
    this.partId = partId;

    const object = partId ? this.objectFor(partId) : null;

    if (object) object.getWorldPosition(this.tracked);
  }

  update(): boolean {
    const object = this.partId ? this.objectFor(this.partId) : null;

    if (!object) return false;

    const now = object.getWorldPosition(new THREE.Vector3());
    const step = now.clone().sub(this.tracked).multiplyScalar(CATCH_UP);

    if (step.lengthSq() < 1e-6) return false;

    this.tracked.add(step);
    this.stage.camera.position.add(step);
    this.stage.orbit.target.add(step);

    return true;
  }
}
