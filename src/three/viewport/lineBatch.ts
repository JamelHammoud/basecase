import * as THREE from 'three';

const START_VERTICES = 65_536;
const START_INSTANCES = 256;
const WASTE_TO_COMPACT = 0.5;

interface Range {
  start: number;
  count: number;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

const MATRIX_LOOKUP = `
attribute float lineInstance;
uniform highp sampler2D lineMatrices;
mat4 lineMatrix() {
  int size = textureSize(lineMatrices, 0).x;
  int j = int(lineInstance) * 4;
  int x = j % size;
  int y = j / size;
  return mat4(
    texelFetch(lineMatrices, ivec2(x, y), 0),
    texelFetch(lineMatrices, ivec2(x + 1, y), 0),
    texelFetch(lineMatrices, ivec2(x + 2, y), 0),
    texelFetch(lineMatrices, ivec2(x + 3, y), 0)
  );
}
`;

function matricesTexture(instances: number): THREE.DataTexture {
  const size = Math.ceil(Math.ceil(Math.sqrt(instances * 4)) / 4) * 4;
  const texture = new THREE.DataTexture(
    new Float32Array(size * size * 4),
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );

  texture.needsUpdate = true;

  return texture;
}

function batchedLineMaterial(source: THREE.LineBasicMaterial, matrices: { value: THREE.DataTexture }) {
  const material = source.clone();

  material.name = 'batched-lines';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lineMatrices = matrices;
    shader.vertexShader = `${MATRIX_LOOKUP}\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed = (lineMatrix() * vec4(transformed, 1.0)).xyz;',
    );
  };
  material.customProgramCacheKey = () => 'batched-lines';

  return material;
}

function lineGeometry(vertices: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const instance = new THREE.BufferAttribute(new Float32Array(vertices), 1).setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', position);
  geometry.setAttribute('lineInstance', instance);
  geometry.setDrawRange(0, 0);

  return geometry;
}

function copyPositions(
  source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  target: Float32Array,
  at: number,
) {
  if (source instanceof THREE.BufferAttribute && source.array instanceof Float32Array && source.itemSize === 3) {
    target.set(source.array.subarray(0, source.count * 3), at * 3);

    return;
  }

  for (let i = 0; i < source.count; i++) {
    target[(at + i) * 3] = source.getX(i);
    target[(at + i) * 3 + 1] = source.getY(i);
    target[(at + i) * 3 + 2] = source.getZ(i);
  }
}

export class LineBatch {
  readonly lines: THREE.LineSegments;

  private readonly matrices: { value: THREE.DataTexture };

  private readonly ranges = new Map<number, Range>();

  private readonly stored = new Map<number, THREE.Matrix4>();

  private readonly hidden = new Set<number>();

  private free: Range[] = [];

  private freeInstances: number[] = [];

  private nextInstance = 0;

  private instanceCapacity = START_INSTANCES;

  private capacity = START_VERTICES;

  private used = 0;

  private live = 0;

  constructor(material: THREE.LineBasicMaterial) {
    this.matrices = { value: matricesTexture(START_INSTANCES) };
    this.lines = new THREE.LineSegments(lineGeometry(START_VERTICES), batchedLineMaterial(material, this.matrices));
    this.lines.name = 'part-line-batch';
    this.lines.frustumCulled = false;
    this.lines.matrixAutoUpdate = false;
    this.lines.raycast = () => {};
  }

  readonly tintable = false;

  get object(): THREE.Object3D {
    return this.lines;
  }

  get size(): number {
    return this.ranges.size;
  }

  setColor(): void {}

  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): number {
    const instance = this.allocateInstance();
    const position = geometry.getAttribute('position');
    const range = this.allocate(position.count);

    this.ranges.set(instance, range);
    this.write(instance, range, position);
    this.setMatrix(instance, matrix);

    return instance;
  }

  remove(instance: number): void {
    const range = this.ranges.get(instance);

    if (!range) return;

    this.writeMatrix(instance, ZERO);
    this.ranges.delete(instance);
    this.stored.delete(instance);
    this.hidden.delete(instance);
    this.freeInstances.push(instance);
    this.release(range);
  }

  setMatrix(instance: number, matrix: THREE.Matrix4): void {
    this.stored.set(instance, matrix.clone());

    if (!this.hidden.has(instance)) this.writeMatrix(instance, matrix);
  }

  setVisible(instance: number, visible: boolean): void {
    if (visible) this.hidden.delete(instance);
    else this.hidden.add(instance);

    this.writeMatrix(instance, visible ? (this.stored.get(instance) ?? ZERO) : ZERO);
  }

  refresh(geometry: THREE.BufferGeometry, instance: number): void {
    const range = this.ranges.get(instance);
    const position = geometry.getAttribute('position');

    if (!range) return;

    if (position.count === range.count) {
      this.write(instance, range, position);

      return;
    }

    this.release(range);

    const next = this.allocate(position.count);

    this.ranges.set(instance, next);
    this.write(instance, next, position);
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.matrices.value.dispose();
  }

  private allocateInstance(): number {
    const reused = this.freeInstances.pop();

    if (reused !== undefined) return reused;

    if (this.nextInstance >= this.instanceCapacity) this.growInstances();

    return this.nextInstance++;
  }

  private growInstances(): void {
    const old = this.matrices.value;

    this.instanceCapacity *= 2;
    this.matrices.value = matricesTexture(this.instanceCapacity);
    (this.matrices.value.image.data as Float32Array).set(old.image.data as Float32Array);
    old.dispose();
  }

  private writeMatrix(instance: number, matrix: THREE.Matrix4): void {
    matrix.toArray(this.matrices.value.image.data as Float32Array, instance * 16);
    this.matrices.value.needsUpdate = true;
  }

  private write(instance: number, range: Range, source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
    const position = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ids = this.lines.geometry.getAttribute('lineInstance') as THREE.BufferAttribute;

    copyPositions(source, position.array as Float32Array, range.start);
    (ids.array as Float32Array).fill(instance, range.start, range.start + range.count);
    position.addUpdateRange(range.start * 3, range.count * 3);
    ids.addUpdateRange(range.start, range.count);
    position.needsUpdate = true;
    ids.needsUpdate = true;
  }

  private allocate(count: number): Range {
    const fit = this.free.findIndex((r) => r.count >= count);

    this.live += count;

    if (fit >= 0) return this.takeFree(fit, count);

    if (this.used + count > this.capacity) this.makeRoom(count);

    const range = { start: this.used, count };

    this.used += count;
    this.lines.geometry.setDrawRange(0, this.used);

    return range;
  }

  private takeFree(index: number, count: number): Range {
    const slot = this.free[index];
    const range = { start: slot.start, count };

    if (slot.count === count) this.free.splice(index, 1);
    else this.free[index] = { start: slot.start + count, count: slot.count - count };

    return range;
  }

  private release(range: Range): void {
    this.live -= range.count;

    const position = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;

    (position.array as Float32Array).fill(0, range.start * 3, (range.start + range.count) * 3);
    position.addUpdateRange(range.start * 3, range.count * 3);
    position.needsUpdate = true;
    this.free.push(range);
  }

  private makeRoom(count: number): void {
    const compact = this.used - this.live >= this.capacity * WASTE_TO_COMPACT;
    const capacity = compact
      ? Math.max(this.capacity, (this.live + count) * 2)
      : Math.max(this.capacity * 2, this.used + count);

    this.rebuild(capacity, compact);
  }

  private rebuild(capacity: number, compact: boolean): void {
    const old = this.lines.geometry;
    const oldPosition = old.getAttribute('position').array as Float32Array;
    const oldIds = old.getAttribute('lineInstance').array as Float32Array;
    const geometry = lineGeometry(capacity);
    const position = geometry.getAttribute('position').array as Float32Array;
    const ids = geometry.getAttribute('lineInstance').array as Float32Array;

    if (compact) {
      let at = 0;

      for (const range of this.ranges.values()) {
        position.set(oldPosition.subarray(range.start * 3, (range.start + range.count) * 3), at * 3);
        ids.set(oldIds.subarray(range.start, range.start + range.count), at);
        range.start = at;
        at += range.count;
      }

      this.used = at;
      this.free = [];
    } else {
      position.set(oldPosition);
      ids.set(oldIds);
    }

    geometry.setDrawRange(0, this.used);
    this.capacity = capacity;
    this.lines.geometry = geometry;
    old.dispose();
  }
}
