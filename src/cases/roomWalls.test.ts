import { describe, expect, it } from 'vitest';
import { roomObjects, type RoomScan, type RoomSurface } from './roomWalls';
import type { WorldObject } from './schema';

const wall: RoomSurface = { id: 'wall', size: [1000, 1000, 0], center: [0, 500, 0], yaw: 0 };

function opening(left: number, right: number, bottom: number, top: number): RoomSurface {
  return {
    parent: 'wall',
    size: [right - left, top - bottom, 0],
    center: [(left + right) / 2, (bottom + top) / 2, 0],
    yaw: 0,
  };
}

const scanOf = (edit: Partial<RoomScan> = {}): RoomScan => ({
  walls: [structuredClone(wall)],
  doors: [],
  windows: [],
  openings: [],
  objects: [],
  ...edit,
});

function contains(surface: RoomSurface, x: number, y: number, toFloor = false): boolean {
  return (
    Math.abs(x - surface.center[0]) < surface.size[0] / 2 &&
    y < surface.center[1] + surface.size[1] / 2 &&
    (toFloor || y > surface.center[1] - surface.size[1] / 2)
  );
}

const inPiece = (piece: WorldObject, x: number, y: number) =>
  Math.abs(x - piece.position[0]) < piece.size[0] / 2 && Math.abs(y - piece.position[1]) < piece.size[1] / 2;

const emptyAt = (scan: RoomScan, x: number, y: number) =>
  [...scan.doors, ...scan.openings].some((hole) => contains(hole, x, y, true)) ||
  scan.windows.some((hole) => contains(hole, x, y));

function checkWall(scan: RoomScan) {
  const before = structuredClone(scan);
  const pieces = roomObjects(scan);
  let solidCells = 0;

  for (let x = -475; x < 500; x += 50) {
    for (let y = 25; y < 1000; y += 50) {
      const solid = !emptyAt(scan, x, y);
      const covers = pieces.filter((piece) => inPiece(piece, x, y)).length;

      expect(covers).toBe(Number(solid));
      solidCells += Number(solid);
    }
  }

  const volume = pieces.reduce((sum, piece) => sum + piece.size[0] * piece.size[1] * piece.size[2], 0);

  expect(volume).toBe(solidCells * 50 * 50 * 100);
  expect(scan).toEqual(before);
  expect(new Set(pieces.map((piece) => piece.id)).size).toBe(pieces.length);

  return pieces;
}

function generatedScan(seed: number): RoomScan {
  let state = seed;
  const next = (count: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state % count;
  };
  const scan = scanOf();
  const kinds = [scan.windows, scan.doors, scan.openings];

  for (let i = 0; i < 8; i++) {
    const left = (next(25) - 12) * 50;
    const bottom = (next(25) - 2) * 50;
    const hole = opening(left, left + next(15) * 50, bottom, bottom + next(15) * 50);

    kinds[next(kinds.length)].push(hole);
  }

  return scan;
}

describe('RoomPlan wall openings', () => {
  it('keeps the union of unsorted, touching and nested windows, doors and open passages clear', () => {
    checkWall(
      scanOf({
        windows: [
          opening(-400, 300, 700, 900),
          opening(-300, 200, 200, 400),
          opening(-300, 200, 400, 700),
          opening(-100, 100, 300, 500),
        ],
        doors: [opening(200, 400, 100, 600)],
        openings: [opening(-500, -350, 50, 450)],
      }),
    );
  });

  it('clips openings outside the wall and preserves solid material around zero-size openings', () => {
    checkWall(
      scanOf({
        windows: [
          opening(-700, -300, -100, 200),
          opening(300, 700, 800, 1200),
          opening(-200, 200, 1100, 1200),
          opening(-200, 200, -200, -100),
          opening(0, 0, 200, 800),
          opening(-200, 200, 500, 500),
        ],
      }),
    );
  });

  it('preserves exactly one solid layer and its volume across generated mixed openings', () => {
    for (let seed = 1; seed <= 80; seed++) checkWall(generatedScan(seed));
  });

  it('rebuilds after edits without sharing pieces or modifying the scan', () => {
    const scan = scanOf({ windows: [opening(-200, 200, 200, 400), opening(-200, 200, 600, 800)] });
    const first = checkWall(scan);
    const saved = structuredClone(first);

    scan.windows[0].center[1] = 700;

    const edited = checkWall(scan);

    expect(edited).not.toEqual(saved);
    expect(first).toEqual(saved);

    edited[0].position[0] += 100;

    expect(checkWall(scan)).not.toEqual(edited);
    expect(first).toEqual(saved);
  });

  it('retains the one-millimeter horizontal and vertical piece cutoffs', () => {
    const pieces = roomObjects(scanOf({ windows: [opening(-499.5, 499, 1, 999.5)] }));

    expect(pieces.map((piece) => ({ id: piece.id, size: piece.size, position: piece.position }))).toEqual([
      { id: 'wall-0-2-0', size: [1, 1000, 100], position: [499.5, 500, 0] },
    ]);
  });
});
