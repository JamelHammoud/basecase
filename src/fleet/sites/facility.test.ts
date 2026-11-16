import { locatePose, registerControls } from './registration.mjs';
import { siteControls } from './siteFixtures';
import { glbFile } from '../../cases/worldImport/fixtures';
import { expect, it } from 'vitest';
import { prepareFacility } from './facility';

const file = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });
const dxf = [
  '0',
  'SECTION',
  '2',
  'HEADER',
  '9',
  '$INSUNITS',
  '70',
  '4',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'ENTITIES',
  '0',
  'LINE',
  '8',
  'floor-2',
  '10',
  '0',
  '20',
  '0',
  '30',
  '3000',
  '11',
  '12000',
  '21',
  '0',
  '31',
  '3000',
  '0',
  'ENDSEC',
  '0',
  'EOF',
].join('\n');

it('imports a millimeter DXF floor without levelling the source height', async () => {
  const result = await prepareFacility([file('factory.dxf', dxf)], { units: 'mm', up: 'Z' });

  expect(result.metersPerUnit).toBeCloseTo(0.001);
  expect(result.lines).toEqual([0, 0, 3, 12, 0, 3]);
  expect(result.floors).toContain('floor-2');
  expect(result.sources[0].hash).toMatch(/^[0-9a-f]{64}$/);
});

it('uses existing OBJ parsing and declared axes without Case floor levelling', async () => {
  const result = await prepareFacility([file('workshop.obj', 'v 0 4 0\nv 2 4 0\nv 0 4 -2\nf 1 2 3')], {
    units: 'm',
    up: 'Y',
  });

  expect(result.positions).toEqual([0, 0, 4, 2, 0, 4, 0, 2, 4]);
});

it('accepts a PLY corridor while preserving its measured elevations', async () => {
  const result = await prepareFacility(
    [
      file(
        'corridor.ply',
        'ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 2\n5 0 2\n',
      ),
    ],
    { units: 'm', up: 'Z' },
  );

  expect(result.points).toEqual([0, 0, 2, 5, 0, 2]);
  expect(
    locatePose(
      { frame: 'facility', pointM: result.points.slice(0, 3) as [number, number, number], quality: 'reported' },
      registerControls(siteControls),
    )?.altitudeM,
  ).toBeCloseTo(22, 2);
});

it('refuses unknown units, remote dependencies and oversized source data', async () => {
  await expect(
    prepareFacility([file('workshop.obj', 'mtllib https://example.test/a.mtl\nv 0 0 0')], { units: 'm', up: 'Y' }),
  ).rejects.toThrow();
  await expect(prepareFacility([file('factory.dxf', dxf)], JSON.parse('{"units":"auto","up":"Z"}'))).rejects.toThrow();
  await expect(
    prepareFacility([file('miles.dxf', dxf.replace('$INSUNITS\n70\n4', '$INSUNITS\n70\n3'))], { units: 'm', up: 'Z' }),
  ).rejects.toThrow('supported units');
  await expect(
    prepareFacility([{ name: 'huge.obj', bytes: new Uint8Array(64 * 1024 * 1024 + 1) }], { units: 'm', up: 'Y' }),
  ).rejects.toThrow();
});

it('imports a meter GLB warehouse without changing its source frame', async () => {
  const result = await prepareFacility([glbFile()], { units: 'm', up: 'Y' });

  expect(result.positions.slice(0, 3)).toEqual([-3, 2, 0]);
  expect(result.indices).toHaveLength(6);
  expect(result.metersPerUnit).toBe(1);
});

it('preserves multilevel hospital floor identity and the elevated source geometry', async () => {
  const source = file('hospital.obj', 'v 0 0 0\nv 10 0 0\nv 0 10 0\nv 0 0 12\nv 10 0 12\nv 0 10 12\nf 1 2 3\nf 4 5 6');
  const result = await prepareFacility([source], { units: 'm', up: 'Z', floors: ['Ground', 'Level 2'] });

  expect(result.positions.filter((_, index) => index % 3 === 2)).toEqual([0, 0, 0, 12, 12, 12]);
  expect(result.floors).toEqual(['Ground', 'Level 2']);
});
