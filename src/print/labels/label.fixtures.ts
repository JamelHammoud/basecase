import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';

type V3 = [number, number, number];

const TRAY = { w: 80, h: 60, d: 60, wall: 4, floor: 4 };
const LID = 4;

function quad(out: number[], [a, b, c, d]: V3[]) {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

function ring(y: number, hw: number, hd: number): V3[] {
  return [
    [-hw, y, -hd],
    [hw, y, -hd],
    [hw, y, hd],
    [-hw, y, hd],
  ];
}

export function openTray(): number[] {
  const { w, h, d, wall, floor } = TRAY;
  const out: number[] = [];
  const bottom = ring(0, w / 2, d / 2);
  const top = ring(h, w / 2, d / 2);
  const rim = ring(h, w / 2 - wall, d / 2 - wall);
  const inner = ring(floor, w / 2 - wall, d / 2 - wall);

  quad(out, [bottom[0], bottom[1], bottom[2], bottom[3]]);
  quad(out, [inner[3], inner[2], inner[1], inner[0]]);

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;

    quad(out, [bottom[j], bottom[i], top[i], top[j]]);
    quad(out, [top[j], top[i], rim[i], rim[j]]);
    quad(out, [rim[j], rim[i], inner[i], inner[j]]);
  }

  return out;
}

const soup = (geometry: THREE.BufferGeometry) =>
  Array.from((geometry.index ? geometry.toNonIndexed() : geometry).attributes.position.array as Float32Array);

const box = (w: number, h: number, d: number) => soup(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));

function bracket(): number[] {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(24, 0),
    new THREE.Vector2(24, 4),
    new THREE.Vector2(8, 4),
    new THREE.Vector2(4, 12),
    new THREE.Vector2(4, 40),
    new THREE.Vector2(0, 40),
  ]);

  return soup(new THREE.ExtrudeGeometry(shape, { depth: 30, bevelEnabled: false }).translate(0, 0, -15));
}

function mirrored(positions: number[]): number[] {
  const out: number[] = [];

  for (let t = 0; t < positions.length; t += 9) {
    const [a, b, c] = [0, 3, 6].map((o) => [-positions[t + o], positions[t + o + 1], positions[t + o + 2]]);

    out.push(...a, ...c, ...b);
  }

  return out;
}

function printed(id: string, name: string, positions: number[], at: V3): ScenePart {
  const box3 = new THREE.Box3().setFromArray(positions);
  const size = box3.getSize(new THREE.Vector3()).toArray() as V3;

  return {
    id,
    name,
    kind: 'cad_part',
    category: 'structure',
    role: 'solid',
    position: at,
    rotation: [0, 0, 0],
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    color: '#eeeeee',
    note: '',
    visible: true,
    locked: false,
    cad: {
      language: 'openscad',
      code: '',
      positions,
      indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
      originOffset: [0, 0, 0],
      baseSize: size,
    },
  };
}

export function labelFixture(): ScenePart[] {
  const side = TRAY.w / 2;

  return [
    printed('tray', 'Body Tray', openTray(), [0, 0, 0]),
    printed('lid', 'Body Lid', box(TRAY.w, LID, TRAY.d), [0, TRAY.h, 0]),
    printed('bracket-left', 'Left Hip Bracket', mirrored(bracket()), [-side, 10, 0]),
    printed('bracket-right', 'Right Hip Bracket', bracket(), [side, 10, 0]),
    printed('tag', 'Spare Tag', box(30, 6, 20), [200, 0, 0]),
  ];
}

export function fixtureMesh(part: ScenePart): THREE.Mesh {
  const geometry = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.BufferAttribute(Float32Array.from(part.cad!.positions), 3),
  );
  const mesh = new THREE.Mesh(geometry);

  mesh.position.set(...part.position);
  mesh.updateMatrixWorld();

  return mesh;
}
