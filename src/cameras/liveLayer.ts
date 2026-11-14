import * as THREE from 'three';
import { posed, type Posed } from '../datasets/renderVideos';
import { isHexColor, type WorldLooks } from '../sim/worldLooks';
import { releasePartGroup } from '../three/buildPartMesh';
import type { ScenePart } from '../types/robotics';

interface Built {
  part: ScenePart;
  posed: Posed;
  color: string;
}

export class LiveLayer {
  private readonly built = new Map<string, Built>();

  private readonly root = new THREE.Group();

  private looks: WorldLooks = {};

  items: Posed[] = [];

  constructor(scene: THREE.Object3D) {
    scene.add(this.root);
  }

  changed(parts: ScenePart[]): ScenePart[] {
    return parts.filter((p) => this.built.get(p.id)?.part !== p);
  }

  sync(parts: ScenePart[]): void {
    const byId = new Map(parts.map((p) => [p.id, p]));

    for (const [id, b] of this.built) {
      if (byId.get(id) === b.part) continue;

      this.drop(b);
      this.built.delete(id);
    }

    for (const part of parts) if (!this.built.has(part.id)) this.build(part);

    this.list();
  }

  setLooks(looks: WorldLooks): void {
    this.looks = looks;

    for (const b of this.built.values()) {
      if (b.color === this.colorOf(b.part)) b.posed.group.visible = this.visibleOf(b.part);
      else this.rebuild(b);
    }

    this.list();
  }

  group(id: string): THREE.Group | undefined {
    return this.built.get(id)?.posed.group;
  }

  dispose(): void {
    this.sync([]);
  }

  private colorOf(part: ScenePart): string {
    const color = this.looks[part.id]?.color;

    return isHexColor(color) ? color.toLowerCase() : part.color;
  }

  private visibleOf(part: ScenePart): boolean {
    return this.looks[part.id]?.visible !== false;
  }

  private build(part: ScenePart): void {
    const color = this.colorOf(part);
    const made = posed(color === part.color ? part : { ...part, color });

    made.group.visible = this.visibleOf(part);
    this.root.add(made.group);
    this.built.set(part.id, { part, posed: made, color });
  }

  private rebuild(b: Built): void {
    this.drop(b);
    this.build(b.part);
  }

  private drop(b: Built): void {
    b.posed.group.removeFromParent();
    releasePartGroup(b.posed.group);
  }

  private list(): void {
    this.items = [...this.built.values()].map((b) => b.posed);
  }
}
