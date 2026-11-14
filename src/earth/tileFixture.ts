import * as THREE from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer/three';
import { TILES_ROOT_PATH } from './tilePaths';

export const FIXTURE_SPOT = { lat: 37.7793, lon: -122.4193 };
export const FIXTURE_GROUND_M = 16;
export const FIXTURE_SESSION = 'fixture-session';
export const FIXTURE_COPYRIGHT = 'Fixture Imagery';

const ROOT_HALF_M = 2000;
const ROOT_CENTER_M: [number, number] = [-700, -600];
const ROOT_LIFT_M = 3;
const QUADRANT_LIFT_M = 1;
const QUADRANT_ERROR_M = 2;

interface Square {
  name: string;
  center: [number, number];
  half: number;
  lift: number;
  error: number;
  children: Square[];
}

const SIGNS: Array<[number, number]> = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

const split = (parent: Square, lift: number, error: number): Square[] =>
  SIGNS.map(([sx, sy], i) => ({
    name: `${parent.name}${i}`,
    center: [parent.center[0] + (sx * parent.half) / 2, parent.center[1] + (sy * parent.half) / 2],
    half: parent.half / 2,
    lift,
    error,
    children: [],
  }));

function fixtureSquares(): Square {
  const root: Square = {
    name: 'r',
    center: ROOT_CENTER_M,
    half: ROOT_HALF_M,
    lift: ROOT_LIFT_M,
    error: 400,
    children: [],
  };

  root.children = split(root, QUADRANT_LIFT_M, QUADRANT_ERROR_M).map((quadrant) => ({
    ...quadrant,
    children: split(quadrant, 0, 0),
  }));

  return root;
}

const tileUri = (name: string) => `/v1/3dtiles/files/${name}.glb?session=${FIXTURE_SESSION}`;

function tileJson(square: Square): Record<string, unknown> {
  const [cx, cy] = square.center;
  const z = FIXTURE_GROUND_M + square.lift;

  return {
    boundingVolume: { box: [cx, cy, z, square.half, 0, 0, 0, square.half, 0, 0, 0, 5] },
    geometricError: square.error,
    refine: 'REPLACE',
    content: { uri: tileUri(square.name) },
    ...(square.children.length ? { children: square.children.map(tileJson) } : {}),
  };
}

function spotFrame(): number[] {
  const rad = THREE.MathUtils.degToRad;

  return WGS84_ELLIPSOID.getEastNorthUpFrame(
    rad(FIXTURE_SPOT.lat),
    rad(FIXTURE_SPOT.lon),
    0,
    new THREE.Matrix4(),
  ).toArray();
}

export function fixtureTileset(): Record<string, unknown> {
  return {
    asset: { version: '1.0' },
    geometricError: 4000,
    root: { ...tileJson(fixtureSquares()), transform: spotFrame() },
  };
}

const pad4 = (n: number) => Math.ceil(n / 4) * 4;

function glb(json: object, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.length);
  const binLength = pad4(bin.length);
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
  const view = new DataView(out.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLength);
  out.set(jsonBytes, 20);
  view.setUint32(20 + jsonLength, binLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  out.set(bin, 28 + jsonLength);

  return out;
}

function squareGlb(square: Square): Uint8Array {
  const [cx, cy] = square.center;
  const { half } = square;
  const up = FIXTURE_GROUND_M + square.lift;
  const corners = [
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
  ];
  const positions = new Float32Array(corners.flatMap(([e, n]) => [e, up, -n]));
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);

  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);

  const json = {
    asset: { version: '2.0', copyright: FIXTURE_COPYRIGHT },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.45, 0.45, 0.45, 1], metallicFactor: 0 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: 'VEC3',
        min: [cx - half, up, -(cy + half)],
        max: [cx + half, up, -(cy - half)],
      },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  };

  return glb(json, bin);
}

function squaresByName(): Map<string, Square> {
  const byName = new Map<string, Square>();
  const visit = (square: Square) => {
    byName.set(square.name, square);
    square.children.forEach(visit);
  };

  visit(fixtureSquares());

  return byName;
}

export const FIXTURE_TILE_COUNT = squaresByName().size;

export function fixtureTileBytes(path: string): Uint8Array | null {
  const url = new URL(path, 'https://fixture.invalid');

  if (url.pathname === TILES_ROOT_PATH) return new TextEncoder().encode(JSON.stringify(fixtureTileset()));

  const name = /^\/v1\/3dtiles\/files\/(r\d*)\.glb$/.exec(url.pathname)?.[1];
  const square = name ? squaresByName().get(name) : undefined;

  return square ? squareGlb(square) : null;
}
