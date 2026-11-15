import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { driveOptions, HardwareType, makeSpec } from '../data/hardware';
import { buildHardwarePieces, HardwarePiece } from './hardwareMesh';
import * as recessGeometry from './hardwareRecessGeometry';
import { cleanRecessGeometry, recessGroupGeometry } from './hardwareRecessGeometry';

function previousClean(g: THREE.BufferGeometry) {
  const source = g.index ? g.toNonIndexed() : g;
  const pos = source.attributes.position;
  const normal = source.attributes.normal;
  const positions: number[] = [];
  const normals: number[] = [];

  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);

    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-12) continue;

    for (let j = 0; j < 3; j++) {
      positions.push(pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j));
      normals.push(normal.getX(i + j), normal.getY(i + j), normal.getZ(i + j));
    }
  }

  if (source !== g) source.dispose();

  return { position: new Float32Array(positions), normal: new Float32Array(normals) };
}

function previousGroup(g: THREE.BufferGeometry, group: { start: number; count: number }) {
  const pos = g.attributes.position;
  const normal = g.attributes.normal;
  const position = new Float32Array(group.count * 3);
  const normals = new Float32Array(group.count * 3);

  for (let i = 0; i < group.count; i++) {
    const v = g.index ? g.index.getX(group.start + i) : group.start + i;

    position.set([pos.getX(v), pos.getY(v), pos.getZ(v)], i * 3);
    normals.set([normal.getX(v), normal.getY(v), normal.getZ(v)], i * 3);
  }

  return { position, normal: normals };
}

function buffers(g: THREE.BufferGeometry) {
  return { position: g.attributes.position.array, normal: g.attributes.normal.array };
}

function interleaved(g: THREE.BufferGeometry) {
  const pos = g.attributes.position;
  const normal = g.attributes.normal;
  const packed = new Float32Array(pos.count * 8);

  for (let i = 0; i < pos.count; i++) {
    packed.set([42, pos.getX(i), pos.getY(i), pos.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i), -42], i * 8);
  }

  const data = new THREE.InterleavedBuffer(packed, 8);

  g.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 1));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(data, 3, 4));

  return g;
}

function fixture(triangles: number) {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array(triangles * 9);

  for (let i = 0; i < triangles; i++) positions.set([i, 0, 0, i + 1, 0, 0, i, 1, 0], i * 9);

  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.computeVertexNormals();
  g.setIndex(Array.from({ length: triangles * 3 }, (_, i) => i));

  return g;
}

function geometryOf(data: { position: Float32Array; normal: Float32Array }) {
  const g = new THREE.BufferGeometry();

  g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));

  return g;
}

function pieceData(pieces: HardwarePiece[]) {
  return pieces.map((piece) => ({ ...buffers(piece.geometry), material: piece.material, edges: piece.edges }));
}

describe('screw recess construction', () => {
  it('matches the previous CSG pieces for every recessed screw type and supported drive', () => {
    const types: HardwareType[] = ['socket_head', 'pan_head', 'button_head', 'countersunk', 'set_screw'];
    const materials = {
      main: new THREE.MeshStandardMaterial(),
      dark: new THREE.MeshStandardMaterial(),
      nylon: new THREE.MeshStandardMaterial(),
    };

    for (const type of types) {
      for (const drive of driveOptions(type)) {
        const spec = makeSpec(type, { size: 'M3', length: 12, drive });
        const actual = buildHardwarePieces(spec, materials);
        const clean = vi.spyOn(recessGeometry, 'cleanRecessGeometry').mockImplementation((g) => {
          const data = previousClean(g);

          g.dispose();

          return geometryOf(data);
        });
        const group = vi
          .spyOn(recessGeometry, 'recessGroupGeometry')
          .mockImplementation((g, range) => geometryOf(previousGroup(g, range)));

        try {
          const expected = buildHardwarePieces(spec, materials);

          expect(clean).toHaveBeenCalledTimes(2);
          expect(group).toHaveBeenCalled();
          expect(pieceData(actual), `${type} ${drive}`).toEqual(pieceData(expected));
          expect(actual.some((piece) => piece.material === materials.dark)).toBe(true);

          [...actual, ...expected].forEach((piece) => piece.geometry.dispose());
        } finally {
          clean.mockRestore();
          group.mockRestore();
        }
      }
    }

    for (const material of Object.values(materials)) material.dispose();
  });
});

describe('recess geometry copies', () => {
  it('preserves complete buffers across indexed, expanded, interleaved and transformed meshes', () => {
    for (let i = 0; i < 60; i++) {
      const g = i % 2 ? new THREE.SphereGeometry(2, 8 + (i % 5), 6) : new THREE.BoxGeometry(2, 3, 4, 2, 2, 2);

      g.scale(i % 3 ? 0.7 : -1.3, 1 + i / 10, 0.2 + i / 60);
      g.rotateX(i * 0.13);
      g.rotateY(i * 0.21);
      g.translate(i - 30, i / 7, -i / 3);

      const expanded = g.toNonIndexed();
      const variants = [g, expanded, interleaved(g.clone())];

      for (const source of variants) {
        const before = source.clone();
        const expected = previousClean(source);
        const dispose = vi.fn();

        source.addEventListener('dispose', dispose);

        const cleaned = cleanRecessGeometry(source);

        expect(buffers(cleaned)).toEqual(expected);
        expect(buffers(source)).toEqual(buffers(before));
        expect(source.index?.array).toEqual(before.index?.array);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(cleaned.index).toBeNull();

        for (const group of [
          { start: 0, count: 0 },
          { start: 3, count: 9 },
          { start: 0, count: 36 },
        ]) {
          const piece = recessGroupGeometry(source, group);

          expect(buffers(piece)).toEqual(previousGroup(source, group));
          expect(piece.index).toBeNull();
          piece.dispose();
        }

        cleaned.dispose();
        before.dispose();
      }
    }
  });

  it('retains the strict area cutoff, winding, nonfinite values and empty geometry', () => {
    const g = new THREE.BufferGeometry();
    const positions = new Float64Array(
      [
        [0, 0, 0, 1, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0, 0.000000999999, 0],
        [0, 0, 0, 1, 0, 0, 0, 0.000001, 0],
        [0, 0, 0, 1, 0, 0, 0, 0.000001000001, 0],
        [0, 0, 0, 0, 1, 0, 1, 0, 0],
        [NaN, 0, 0, 1, 0, 0, 0, 1, 0],
        [Infinity, 0, 0, 1, 0, 0, 0, 1, 0],
      ].flat(),
    );

    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(positions.length).fill(127), 3, true));

    expect(buffers(cleanRecessGeometry(g))).toEqual(previousClean(g));
    expect(cleanRecessGeometry(g).attributes.position.count).toBe(15);
    expect(buffers(recessGroupGeometry(g, { start: 0, count: 21 }))).toEqual(previousGroup(g, { start: 0, count: 21 }));

    const empty = fixture(0);

    expect(buffers(cleanRecessGeometry(empty))).toEqual({ position: new Float32Array(), normal: new Float32Array() });
  });

  it('owns results and reads edits to source positions, normals and indices', () => {
    const g = fixture(3);
    const first = cleanRecessGeometry(g);
    const group = { start: 0, count: 6 };
    const piece = recessGroupGeometry(g, group);
    const savedClean = first.clone();
    const savedPiece = piece.clone();

    g.attributes.position.setXYZ(0, 4, 5, 6);
    g.attributes.normal.setXYZ(0, 0.25, 0.5, 0.75);
    g.index!.setX(1, 8);

    expect(buffers(cleanRecessGeometry(g))).toEqual(previousClean(g));
    expect(buffers(recessGroupGeometry(g, group))).toEqual(previousGroup(g, group));
    expect(buffers(first)).toEqual(buffers(savedClean));
    expect(buffers(piece)).toEqual(buffers(savedPiece));
    expect(buffers(recessGroupGeometry(g, group))).not.toEqual(buffers(piece));
  });

  it.each([300, 600])('removes triangle clones, indexed expansion and vertex arrays on %i triangles', (triangles) => {
    const g = fixture(triangles);
    const clones = vi.spyOn(THREE.Vector3.prototype, 'clone');
    const expansion = vi.spyOn(g, 'toNonIndexed');
    const sets = vi.spyOn(Float32Array.prototype, 'set');

    try {
      previousClean(g);
      expect(clones).toHaveBeenCalledTimes(triangles * 2);
      expect(expansion).toHaveBeenCalledTimes(1);
      clones.mockClear();
      expansion.mockClear();
      cleanRecessGeometry(g);
      expect(clones).not.toHaveBeenCalled();
      expect(expansion).not.toHaveBeenCalled();
      sets.mockClear();
      previousGroup(g, { start: 0, count: triangles * 3 });
      expect(sets).toHaveBeenCalledTimes(triangles * 6);
      sets.mockClear();
      recessGroupGeometry(g, { start: 0, count: triangles * 3 });
      expect(sets).not.toHaveBeenCalled();
    } finally {
      clones.mockRestore();
      expansion.mockRestore();
      sets.mockRestore();
      g.dispose();
    }
  });
});
