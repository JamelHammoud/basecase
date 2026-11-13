import * as THREE from 'three';
import type { RobotGhost } from '../../robot/robotGhost';
import { projectPoints } from './measurements';
import type { ViewportContext } from './viewportContext';

export const GHOST_COLOR = 0x0d99ff;

const UNIT = new THREE.Vector3(1, 1, 1);

const unpickable = () => {};

interface GhostPart {
  source: THREE.Group;
  group: THREE.Group;
}

export interface GhostState {
  parts: Record<string, number[]>;
  values: Record<string, number>;
  label: string | null;
}

function restMatrix(source: THREE.Group): THREE.Matrix4 | null {
  const position = source.userData.restPosition as THREE.Vector3 | undefined;
  const quaternion = source.userData.restQuaternion as THREE.Quaternion | undefined;

  return position && quaternion ? new THREE.Matrix4().compose(position, quaternion, UNIT) : null;
}

export class GhostLayer {
  private readonly root = new THREE.Group();

  private readonly material = new THREE.MeshStandardMaterial({
    color: GHOST_COLOR,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    roughness: 0.6,
  });

  private readonly entries = new Map<string, GhostPart>();

  private ghost: RobotGhost | null = null;

  private readonly ctx: ViewportContext;

  private readonly label: () => HTMLElement | null;

  constructor(ctx: ViewportContext, label: () => HTMLElement | null) {
    this.ctx = ctx;
    this.label = label;
    this.root.name = 'robot-ghost';
    this.root.matrixAutoUpdate = false;
    ctx.stage.overlays.add(this.root);
  }

  set(ghost: RobotGhost | null): void {
    this.ghost = ghost;
    this.sync();
    this.ctx.loop.invalidate();
  }

  sync(): void {
    const ghost = this.ghost;
    const keep = new Set(ghost?.parts ?? []);

    for (const [id, entry] of this.entries)
      if (!keep.has(id) || this.ctx.layer.get(id) !== entry.source) this.remove(id, entry);

    for (const id of keep) this.place(id, ghost?.deltas.get(id));

    if (!ghost) this.placeLabel();
  }

  placeLabel(): void {
    const label = this.label();
    const at = this.ghost?.label?.at;

    if (!label) return;

    if (!at || !this.entries.size) {
      label.style.display = 'none';

      return;
    }

    const [screen] = projectPoints(this.ctx, [at]);

    label.textContent = this.ghost?.label?.text ?? '';
    label.style.display = screen.visible ? 'flex' : 'none';
    label.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(12px, -50%)`;
  }

  state(): GhostState | null {
    if (!this.ghost || !this.entries.size) return null;

    const parts = Object.fromEntries([...this.entries].map(([id, { group }]) => [id, [...group.matrixWorld.elements]]));

    return { parts, values: this.ghost.values, label: this.ghost.label?.text ?? null };
  }

  dispose(): void {
    for (const [id, entry] of this.entries) this.remove(id, entry);

    this.ctx.stage.overlays.remove(this.root);
    this.material.dispose();
  }

  private place(id: string, delta: THREE.Matrix4 | undefined): void {
    const source = this.ctx.layer.get(id);
    const rest = source && restMatrix(source);

    if (!source || !rest) return;

    const entry = this.entries.get(id) ?? this.build(id, source);

    entry.group.matrix.copy(delta ? rest.premultiply(delta) : rest);
    entry.group.updateMatrixWorld(true);
  }

  private build(id: string, source: THREE.Group): GhostPart {
    const group = new THREE.Group();

    source.updateWorldMatrix(true, true);

    const toLocal = source.matrixWorld.clone().invert();

    group.matrixAutoUpdate = false;
    source.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (!mesh.isMesh || !mesh.visible) return;

      const copy = new THREE.Mesh(mesh.geometry, this.material);

      copy.matrixAutoUpdate = false;
      copy.matrix.multiplyMatrices(toLocal, mesh.matrixWorld);
      copy.raycast = unpickable;
      group.add(copy);
    });
    this.root.add(group);

    const entry = { source, group };

    this.entries.set(id, entry);

    return entry;
  }

  private remove(id: string, entry: GhostPart): void {
    this.root.remove(entry.group);
    this.entries.delete(id);
  }
}
