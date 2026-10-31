import * as THREE from 'three';
import { batchView, geometryVersion } from './batchKey';

const START_INSTANCES = 64;
const START_VERTICES = 65_536;
const WASTE_TO_COMPACT = 0.5;

interface Size {
  vertices: number;
  indices: number;
}

interface GeometrySlot {
  id: number;
  version: string;
  reserved: Size;
  instances: Set<number>;
}

const sizeOf = (geometry: THREE.BufferGeometry): Size => ({
  vertices: geometry.getAttribute('position').count,
  indices: geometry.index?.count ?? 0,
});

const holds = (slot: Size, size: Size) => slot.vertices >= size.vertices && slot.indices >= size.indices;

export interface BatchOptions {
  material: THREE.MeshStandardMaterial;
  castShadow: boolean;
  receiveShadow: boolean;
  indexed: boolean;
}

export class MeshBatch {
  readonly mesh: THREE.BatchedMesh;

  readonly tintable = true;

  private readonly slots = new Map<THREE.BufferGeometry, GeometrySlot>();

  private free: Array<{ id: number; reserved: Size }> = [];

  private readonly indexed: boolean;

  private capacity: Size;

  private live: Size = { vertices: 0, indices: 0 };

  constructor({ material, castShadow, receiveShadow, indexed }: BatchOptions) {
    this.indexed = indexed;
    this.capacity = { vertices: START_VERTICES, indices: indexed ? START_VERTICES * 2 : 0 };
    this.mesh = new THREE.BatchedMesh(START_INSTANCES, START_VERTICES, START_VERTICES * 2, material);
    this.mesh.name = 'part-batch';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = receiveShadow;
    this.mesh.raycast = () => {};
  }

  get object(): THREE.Object3D {
    return this.mesh;
  }

  get size(): number {
    return this.mesh.instanceCount;
  }

  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color): number {
    const slot = this.slots.get(geometry) ?? this.acquire(geometry);

    if (this.mesh.instanceCount >= this.mesh.maxInstanceCount) {
      this.mesh.setInstanceCount(this.mesh.maxInstanceCount * 2);
    }

    const instance = this.mesh.addInstance(slot.id);

    slot.instances.add(instance);
    this.mesh.setMatrixAt(instance, matrix);
    this.mesh.setColorAt(instance, color);

    return instance;
  }

  remove(instance: number, geometry: THREE.BufferGeometry): void {
    const slot = this.slots.get(geometry);

    this.mesh.deleteInstance(instance);

    if (!slot) return;

    slot.instances.delete(instance);

    if (slot.instances.size) return;

    this.slots.delete(geometry);
    this.release(slot);
  }

  setMatrix(instance: number, matrix: THREE.Matrix4): void {
    this.mesh.setMatrixAt(instance, matrix);
  }

  setColor(instance: number, color: THREE.Color): void {
    this.mesh.setColorAt(instance, color);
  }

  setVisible(instance: number, visible: boolean): void {
    this.mesh.setVisibleAt(instance, visible);
  }

  refresh(geometry: THREE.BufferGeometry): void {
    const slot = this.slots.get(geometry);
    const version = geometryVersion(geometry);

    if (!slot || slot.version === version) return;

    slot.version = version;

    if (holds(slot.reserved, sizeOf(geometry))) {
      this.mesh.setGeometryAt(slot.id, batchView(geometry));

      return;
    }

    const instances = [...slot.instances];

    this.slots.delete(geometry);

    const next = this.acquire(geometry);

    instances.forEach((instance) => {
      this.mesh.setGeometryIdAt(instance, next.id);
      next.instances.add(instance);
    });
    this.release(slot);
  }

  dispose(): void {
    this.mesh.dispose();
    this.mesh.material.dispose();
    this.slots.clear();
    this.free = [];
  }

  private release(slot: GeometrySlot): void {
    this.live.vertices -= slot.reserved.vertices;
    this.live.indices -= slot.reserved.indices;
    this.free.push({ id: slot.id, reserved: slot.reserved });
  }

  private reuse(size: Size): { id: number; reserved: Size } | null {
    let best = -1;

    this.free.forEach((candidate, i) => {
      const better = best < 0 || candidate.reserved.vertices < this.free[best].reserved.vertices;

      if (holds(candidate.reserved, size) && better) best = i;
    });

    return best < 0 ? null : this.free.splice(best, 1)[0];
  }

  private acquire(geometry: THREE.BufferGeometry): GeometrySlot {
    const size = sizeOf(geometry);
    const view = batchView(geometry);
    const reused = this.reuse(size);
    const slot = reused
      ? { id: this.mesh.setGeometryAt(reused.id, view), reserved: reused.reserved }
      : this.fresh(view, size);
    const filled: GeometrySlot = { ...slot, version: geometryVersion(geometry), instances: new Set() };

    this.slots.set(geometry, filled);
    this.live.vertices += filled.reserved.vertices;
    this.live.indices += filled.reserved.indices;

    return filled;
  }

  private fresh(view: THREE.BufferGeometry, size: Size): { id: number; reserved: Size } {
    this.reserve(size);

    return { id: this.mesh.addGeometry(view), reserved: size };
  }

  private fits(size: Size): boolean {
    return (
      this.mesh.unusedVertexCount >= size.vertices && (!this.indexed || this.mesh.unusedIndexCount >= size.indices)
    );
  }

  private compactFor(size: Size): boolean {
    const wasted = this.capacity.vertices - this.mesh.unusedVertexCount - this.live.vertices;

    if (wasted < this.capacity.vertices * WASTE_TO_COMPACT) return false;

    this.free.forEach(({ id }) => this.mesh.deleteGeometry(id));
    this.free = [];
    this.mesh.optimize();

    return this.fits(size);
  }

  private reserve(size: Size): void {
    if (this.fits(size) || this.compactFor(size)) return;

    const usedVertices = this.capacity.vertices - this.mesh.unusedVertexCount;
    const usedIndices = this.capacity.indices - this.mesh.unusedIndexCount;
    const vertices = Math.max(this.capacity.vertices * 2, usedVertices + size.vertices);
    const indices = this.indexed ? Math.max(this.capacity.indices * 2, usedIndices + size.indices) : vertices * 2;

    this.mesh.setGeometrySize(vertices, indices);
    this.capacity = { vertices, indices: this.indexed ? indices : 0 };
  }
}
