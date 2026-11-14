import { describe, expect, it } from 'vitest';
import { FIXTURE_DOOR, FIXTURE_FLOOR_M, FIXTURE_TABLE, fixtureRoom } from './roomFixture';
import { MAX_ROOM_BYTES, readRoomPlan, roomName } from './roomPlan';
import { parseCase, type WorldObject } from './schema';
import { CaseFileError } from './validate';

const read = (room: unknown = fixtureRoom(), name = 'Fixture Flat.json') => readRoomPlan(JSON.stringify(room), name);

const byName = (objects: WorldObject[], name: string) => objects.filter((o) => o.name === name);

const dividerPieces = (objects: WorldObject[]) =>
  byName(objects, 'Wall').filter((o) => Math.abs(o.position[2] - FIXTURE_DOOR.center[1] * 1000) < 1);

const volume = (o: WorldObject) => o.size[0] * o.size[1] * o.size[2];

describe('reading a RoomPlan room', () => {
  it('names the room after its file', () => {
    expect(read().name).toBe('Fixture Flat');
    expect(roomName('living-room.capturedroom.json')).toBe('living-room.capturedroom');
  });

  it('splits the wall around the door, leaving a gap as wide as the door and a lintel over it', () => {
    const pieces = dividerPieces(read().objects);
    const full = pieces.filter((p) => p.position[1] - p.size[1] / 2 < 1).sort((a, b) => a.position[0] - b.position[0]);
    const [left, right] = full;
    const gap = right.position[0] - right.size[0] / 2 - (left.position[0] + left.size[0] / 2);
    const lintel = pieces.find((p) => p.position[1] - p.size[1] / 2 > 1)!;

    expect(full).toHaveLength(2);
    expect(Math.abs(gap - FIXTURE_DOOR.widthM * 1000)).toBeLessThan(1);
    expect(lintel.size[0]).toBeCloseTo(FIXTURE_DOOR.widthM * 1000, 3);
    expect(lintel.position[1] - lintel.size[1] / 2).toBeCloseTo(2100, 3);
  });

  it('keeps the wall under and over a window', () => {
    const north = byName(read().objects, 'Wall').filter((o) => Math.abs(o.position[2] - 4500) < 1);
    const underWindow = north.filter((o) => Math.abs(o.position[0] - 1000) < 1);

    expect(north).toHaveLength(4);
    expect(underWindow.map((o) => [o.position[1] - o.size[1] / 2, o.position[1] + o.size[1] / 2])).toEqual([
      [expect.closeTo(0, 3), expect.closeTo(800, 3)],
      [expect.closeTo(2000, 3), expect.closeTo(2400, 3)],
    ]);
  });

  it('keeps the table as its top, at its size and place, in mm, with the floor at y = 0', () => {
    const [table] = byName(read().objects, 'Table');
    const [x, y, z] = FIXTURE_TABLE.center;
    const [width, height, depth] = FIXTURE_TABLE.dimensions.map((d) => d * 1000);
    const top = (y - FIXTURE_FLOOR_M) * 1000 + height / 2;

    expect(table.position.map((v) => Math.round(v))).toEqual([x * 1000, top - 20, z * 1000]);
    expect(table.size.map((v) => Math.round(v))).toEqual([width, 40, depth]);
    expect(table).toMatchObject({ rotation: [0, 0, 0], behavior: 'static', jitter: { mm: 50, deg: 5 } });
  });

  it('jitters static furniture by the scan’s confidence, and never walls or what can be shoved', () => {
    const room = fixtureRoom();
    const sure = (level: string) => ({
      ...room,
      objects: room.objects.map((o) => ({ ...o, confidence: { [level]: {} } })),
    });
    const tableAt = (file: unknown) => byName(read(file).objects, 'Table')[0].jitter;
    const { objects } = read();

    expect(tableAt(sure('high'))).toEqual({ mm: 50, deg: 5 });
    expect(tableAt(sure('medium'))).toEqual({ mm: 75, deg: 7.5 });
    expect(tableAt(sure('low'))).toEqual({ mm: 100, deg: 10 });
    expect(tableAt(sure('unsure'))).toEqual({ mm: 50, deg: 5 });
    expect(byName(objects, 'Wall').every((o) => o.jitter === undefined)).toBe(true);
    expect(byName(objects, 'Chair')[0].jitter).toBeUndefined();
  });

  it('keeps each door as a place to drive to, out of the world', () => {
    const { objects, doors } = read();

    expect(doors.map((d) => d.name)).toEqual(['Door']);
    expect(doors[0].position[0]).toBeCloseTo(FIXTURE_DOOR.center[0] * 1000, 3);
    expect(doors[0].position[2]).toBeCloseTo(FIXTURE_DOOR.center[1] * 1000, 3);
    expect(objects.some((o) => o.name === 'Door')).toBe(false);
  });

  it('turns a sofa a quarter turn by swapping its sides, and lets the chair be shoved', () => {
    const { objects } = read();
    const [sofa] = byName(objects, 'Sofa');
    const [chair] = byName(objects, 'Chair');

    expect(sofa.rotation).toEqual([0, 0, 0]);
    expect(sofa.size.map(Math.round)).toEqual([900, 850, 2000]);
    expect(chair).toMatchObject({ behavior: 'dynamic', massG: 5000 });
  });

  it('squares a room scanned at an angle to the scene', () => {
    const square = read().objects;
    const turned = read(fixtureRoom({ turnDeg: 25 })).objects;

    expect(turned.map((o) => o.id)).toEqual(square.map((o) => o.id));
    turned.forEach((o, i) => {
      expect(o.rotation).toEqual([0, 0, 0]);
      o.position.forEach((v, k) => expect(v).toBeCloseTo(square[i].position[k], 3));
      o.size.forEach((v, k) => expect(v).toBeCloseTo(square[i].size[k], 3));
    });
  });

  it('validates as a Case world under the object limit', () => {
    const { objects } = read();

    expect(objects.length).toBeLessThan(256);
    expect(() =>
      parseCase({
        formatVersion: 1,
        id: 'room',
        name: 'Room',
        brief: '',
        slot: { needs: ['wheels'], binding: {} },
        world: { objects },
        controls: [],
        reference: { timeline: [] },
        task: {
          seconds: 5,
          probes: [],
          contract: {
            version: 1,
            success: { atom: { expr: { const: 1 }, cmp: '>', value: 0, scale: 1 } },
            failures: [],
          },
        },
      }),
    ).not.toThrow();
  });

  it('keeps the largest 256 objects of a crowded room, never failing', () => {
    const { objects } = read(fixtureRoom({ extraObjects: 400 }));
    const kept = new Set(objects.map((o) => o.id));
    const side = (i: number) => (0.05 + (i % 50) * 0.002) * 1000;
    const dropped = Array.from({ length: 400 }, (_, i) => i).filter((i) => !kept.has(`storage-${i + 1}`));

    expect(objects).toHaveLength(256);
    expect(['table-1', 'sofa-1', 'chair-1'].every((id) => kept.has(id))).toBe(true);
    expect(Math.max(...dropped.map((i) => side(i) ** 3))).toBeLessThanOrEqual(Math.min(...objects.map(volume)));
  });
});

const crafted = () => fixtureRoom() as unknown as Record<string, Array<Record<string, unknown>>>;

function withWall(edit: (wall: Record<string, unknown>) => void) {
  const room = crafted();

  edit(room.walls[0]);

  return JSON.stringify(room);
}

function withCategory(category: unknown) {
  const room = crafted();

  room.objects[0].category = category;

  return JSON.stringify(room);
}

const fixtureText = JSON.stringify(fixtureRoom());

describe('refusing a crafted room file', () => {
  it.each([
    ['a NaN size', fixtureText.replace('[4,2.4,0]', '[NaN,2.4,0]')],
    ['an infinite size', fixtureText.replace('[4,2.4,0]', '[1e999,2.4,0]')],
    ['a size in words', withWall((w) => (w.dimensions = ['4', 2.4, 0]))],
    ['a 1 km wall', withWall((w) => (w.dimensions = [1000, 2.4, 0]))],
    ['a negative size', withWall((w) => (w.dimensions = [-4, 2.4, 0]))],
    ['two sides', withWall((w) => (w.dimensions = [4, 2.4]))],
    ['a short transform', withWall((w) => (w.transform = (w.transform as number[]).slice(0, 15)))],
    ['a wall 1000 km away', withWall((w) => ((w.transform as number[])[12] = 1e6))],
    ['a stretched transform', withWall((w) => ((w.transform as number[])[0] = 400))],
    ['an empty transform', withWall((w) => (w.transform = Array(16).fill(0)))],
    ['markup for a category', withCategory({ '<script>': {} })],
    ['no category', withCategory({})],
    ['1025 walls', JSON.stringify({ ...crafted(), walls: Array(1025).fill(crafted().walls[0]) })],
    ['a file over the size cap', ' '.repeat(MAX_ROOM_BYTES + 1)],
    ['a list', '[]'],
    ['an empty room', '{"walls": [], "objects": []}'],
    ['text', 'not json'],
  ])('refuses %s', (_, text) => {
    expect(() => readRoomPlan(text, 'evil.json')).toThrow(CaseFileError);
  });
});
