import { describe, expect, it } from 'vitest';
import { fixtureRoom } from './roomFixture';
import { readRoomPlan } from './roomPlan';
import { CaseFileError } from './validate';
import { glbOf, gltfOf, objOf, splatPlyOf, spzOf } from './worldFixtureFiles';
import {
  garageMesh,
  inMillimetres,
  KITCHEN_FLOOR_Y,
  KITCHEN_TABLE,
  kitchenMesh,
  splatOn,
  stairwellMesh,
  upsideDown,
  yardMesh,
  type FixtureMesh,
} from './worldFixtures';
import { boxOf, sidesOf } from './worldFrame';
import { floorHeight, isUpsideDown, mmPerUnit, worldFilesOf, worldHash } from './worldImport';
import { readWorldFiles } from './worldFiles';
import type { DroppedFile, WorldSource } from './worldTypes';

const file = (name: string, bytes: Uint8Array): DroppedFile => ({ name, bytes });

async function worldOf(files: DroppedFile[]): Promise<WorldSource> {
  const read = await readWorldFiles(files);

  if (read.kind !== 'world') throw new Error('expected a world');

  return read.world;
}

const ysNear = (world: WorldSource, y: number) => {
  const out: number[] = [];

  for (let i = 0; i < world.positions.length; i += 3) {
    if (Math.abs(world.positions[i + 1] - y) < 2) out.push(world.positions[i]);
  }

  return out;
};

const scaled = (m: FixtureMesh, by: number): FixtureMesh => ({ ...m, positions: m.positions.map((v) => v * by) });

const marbleKitchen = () => [
  file('kitchen.glb', glbOf(kitchenMesh())),
  file('kitchen.ply', splatPlyOf(splatOn(kitchenMesh()))),
];

describe('world drops', () => {
  it('reads a Marble kitchen with its splat, floor levelled to 0', async () => {
    const files = marbleKitchen();
    const world = await worldOf(files);
    const points = splatOn(kitchenMesh()).positions.length / 3;

    expect(worldFilesOf(files)).toEqual(files);
    expect(world.name).toBe('kitchen');
    expect(world.look).toEqual({
      mesh: { file: 'kitchen.glb', format: 'glb' },
      splat: { file: 'kitchen.ply', format: 'ply', points },
    });
    expect(world.files.map((f) => f.name)).toEqual(['kitchen.glb', 'kitchen.ply']);
    expect(world.frame.mmPerUnit).toBe(1000);
    expect(world.frame.flip).toBeUndefined();
    expect(world.frame.liftMm).toBeCloseTo(-KITCHEN_FLOOR_Y * 1000, 0);
    expect(floorHeight(world.positions, world.indices)).toBeCloseTo(0, 0);
    expect(boxOf(world.positions).min[1]).toBeCloseTo(0, 0);
  });

  it('reads an spz splat beside its collider', async () => {
    const splat = splatOn(kitchenMesh());
    const world = await worldOf([file('kitchen.glb', glbOf(kitchenMesh())), file('kitchen.spz', await spzOf(splat))]);

    expect(world.look.splat).toEqual({ file: 'kitchen.spz', format: 'spz', points: splat.positions.length / 3 });
  });

  it('lands a Y-up glTF with its .bin level, its node moves baked in', async () => {
    const files = gltfOf(kitchenMesh(), 'kitchen', { node: { translation: [1, 0.4, -2] } });
    const world = await worldOf(files);
    const tableXs = ysNear(world, KITCHEN_TABLE.top * 1000);

    expect(worldFilesOf(files)).toEqual(files);
    expect(world.files).toEqual(files);
    expect(world.look.mesh).toEqual({ file: 'kitchen.gltf', format: 'gltf' });
    expect(boxOf(world.positions).min[1]).toBeCloseTo(0, 0);
    expect(tableXs.length).toBeGreaterThan(0);
    expect(Math.min(...tableXs)).toBeCloseTo((KITCHEN_TABLE.min[0] + 1) * 1000, 0);
    expect(Math.max(...tableXs)).toBeCloseTo((KITCHEN_TABLE.max[0] + 1) * 1000, 0);
  });

  it('turns a node by its rotation', async () => {
    const turn = { rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] };
    const world = await worldOf([file('kitchen.glb', glbOf(kitchenMesh(), { node: turn }))]);
    const [x, y, z] = sidesOf(boxOf(world.positions));

    expect([x, y, z].map(Math.round)).toEqual([4000, 2500, 5000]);
  });

  it('opens a kitchen drawn in millimetres at true size', async () => {
    const metres = await worldOf([file('kitchen.glb', glbOf(kitchenMesh()))]);
    const mm = await worldOf([file('kitchen.glb', glbOf(inMillimetres(kitchenMesh())))]);

    expect(mm.frame.mmPerUnit).toBe(1);
    sidesOf(boxOf(mm.positions)).forEach((side, i) => expect(side).toBeCloseTo(sidesOf(boxOf(metres.positions))[i], 0));
  });

  it('takes a large mesh alone as a world and leaves small meshes and OBJ as parts', async () => {
    const garage = file('garage.glb', glbOf(garageMesh()));
    const small = file('cube.glb', glbOf(scaled(garageMesh(), 0.02)));
    const obj = file('garage.obj', objOf(garageMesh()));

    expect(worldFilesOf([garage, small, obj])).toEqual([garage]);
    expect(worldFilesOf([small])).toEqual([]);
    expect(worldFilesOf([obj])).toEqual([]);
    expect((await worldOf([garage])).look).toEqual({ mesh: { file: 'garage.glb', format: 'glb' } });
  });

  it('takes an OBJ beside a splat as its collider', async () => {
    const files = [file('yard.obj', objOf(yardMesh())), file('yard.ply', splatPlyOf(splatOn(yardMesh(), 2)))];
    const world = await worldOf(files);

    expect(worldFilesOf(files)).toEqual(files);
    expect(world.look.mesh).toEqual({ file: 'yard.obj', format: 'obj' });
    expect(floorHeight(world.positions, world.indices)).toBeCloseTo(0, 0);
  });

  it('refuses a splat without its collider mesh', async () => {
    const splat = file('kitchen.ply', splatPlyOf(splatOn(kitchenMesh(), 2)));

    expect(worldFilesOf([splat])).toEqual([splat]);
    await expect(readWorldFiles([splat])).rejects.toThrow(CaseFileError);
    await expect(readWorldFiles([splat])).rejects.toThrow('Drop kitchen.ply with its collider mesh.');
  });

  it('reads a RoomPlan file exactly as the room reader does', async () => {
    const text = JSON.stringify(fixtureRoom());
    const read = await readWorldFiles([file('Fixture Flat.json', new TextEncoder().encode(text))]);

    expect(read).toEqual({ kind: 'room', room: readRoomPlan(text, 'Fixture Flat.json') });
  });

  it('hashes the same files the same way, in any order', async () => {
    const files = marbleKitchen();
    const changed = files.map((f, i) =>
      i
        ? f
        : file(
            f.name,
            f.bytes.map((b, k) => (k === 100 ? b ^ 1 : b)),
          ),
    );

    expect(await worldHash(files)).toMatch(/^[0-9a-f]{64}$/);
    expect(await worldHash([...files].reverse())).toBe(await worldHash(files));
    expect(await worldHash(changed)).not.toBe(await worldHash(files));
  });
});

describe('upside-down worlds', () => {
  const tableXs = (world: WorldSource) => ysNear(world, KITCHEN_TABLE.top * 1000);

  it.each([
    ['without a ceiling', false],
    ['with a ceiling', true],
  ])('turns a kitchen exported Y-down %s upright', async (_, ceiling) => {
    const world = await worldOf([file('kitchen.glb', glbOf(upsideDown(kitchenMesh({ ceiling }))))]);

    expect(world.frame.flip).toBe(true);
    expect(boxOf(world.positions).min[1]).toBeCloseTo(0, 0);
    expect(Math.min(...tableXs(world))).toBeCloseTo(KITCHEN_TABLE.min[0] * 1000, 0);
    expect(Math.max(...tableXs(world))).toBeCloseTo(KITCHEN_TABLE.max[0] * 1000, 0);
  });

  it('keeps an upright kitchen with a ceiling as it is', async () => {
    const world = await worldOf([file('kitchen.glb', glbOf(kitchenMesh({ ceiling: true })))]);

    expect(world.frame.flip).toBeUndefined();
    expect(tableXs(world).length).toBeGreaterThan(0);
  });

  it('turns an open yard exported Y-down upright', async () => {
    const world = await worldOf([file('yard.glb', glbOf(upsideDown(yardMesh())))]);
    const rise = boxOf(yardMesh().positions).max[1] * 1000;

    expect(world.frame.flip).toBe(true);
    expect(floorHeight(world.positions, world.indices)).toBeCloseTo(0, 0);
    expect(boxOf(world.positions).max[1]).toBeCloseTo(rise, 0);
  });

  it('leaves a world with nothing level upright', () => {
    expect(isUpsideDown([0, 0, 0, 0, 1, 0, 0, 0, 1], [0, 1, 2])).toBe(false);
    expect(isUpsideDown(yardMesh().positions, yardMesh().indices)).toBe(false);
  });
});

describe('world frame', () => {
  it('reads millimetre files by their extent', () => {
    expect(mmPerUnit(5)).toBe(1000);
    expect(mmPerUnit(200)).toBe(1000);
    expect(mmPerUnit(201)).toBe(1);
    expect(mmPerUnit(5000)).toBe(1);
  });

  it('finds the floor as the largest upward plane', () => {
    const height = (m: FixtureMesh) => floorHeight(m.positions, m.indices);

    expect(height(inMillimetres(kitchenMesh()))).toBeCloseTo(KITCHEN_FLOOR_Y * 1000, 1);
    expect(height(inMillimetres(stairwellMesh()))).toBeCloseTo(0, 3);
    expect(height(inMillimetres(yardMesh()))).toBeCloseTo(0, 3);
    expect(floorHeight([0, 0, 0, 0, 1, 0, 0, 0, 1], [0, 1, 2])).toBeUndefined();
  });
});
