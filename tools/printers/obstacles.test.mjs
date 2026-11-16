import { describe, expect, it } from 'vitest';
import { brimSettings, obstacleSettings } from './obstacles.mjs';

const clip = '0..4;0x0, 12x0, 12x8, 0x8';
const dock = '35..;polygon=180x180, 210x180, 210x210, 180x210';

describe('pinned Orca collision volume settings', () => {
  it('preserves multiple clip and dock polygons, Z ranges and machine clearances', () => {
    expect(
      obstacleSettings({
        printable_height: '250',
        bed_exclude_volumes: `${clip}|${dock}`,
        extruder_clearance_radius: '25',
        extruder_clearance_dist_to_rod: '30',
        extruder_clearance_height_to_rod: '20',
      }),
    ).toEqual({
      obstacles: [
        {
          polygon: [
            [0, 0],
            [12, 0],
            [12, 8],
            [0, 8],
          ],
          zMin: 0,
          zMax: 4,
        },
        {
          polygon: [
            [180, 180],
            [210, 180],
            [210, 210],
            [180, 210],
          ],
          zMin: 35,
          zMax: 250,
        },
      ],
      toolheadClearance: { radius: 30, height: 20 },
    });
  });

  it('supports full-height polygons, newline separators and open lower ranges', () => {
    const settings = obstacleSettings({
      printable_height: '200',
      bed_exclude_volumes: '0x0, 10x0, 10x10\n..12;points=20x20, 30x20, 30x30',
    });

    expect(settings.obstacles.map(({ zMin, zMax }) => [zMin, zMax])).toEqual([
      [0, 200],
      [0, 12],
    ]);
  });

  it('leaves legacy profiles unchanged even when sequential-print clearances exist', () => {
    expect(obstacleSettings({ bed_exclude_area: ['0x0', '10x0', '10x10'], extruder_clearance_radius: '40' })).toEqual(
      {},
    );
    expect(obstacleSettings({ bed_exclude_volumes: ' ', bed_exclude_volume_mode: 'toolhead_offset' })).toEqual({});
  });

  it.each([
    { bed_exclude_volumes: '0..4;0x0, NaNx0, 0x8' },
    { bed_exclude_volumes: '5..4;0x0, 12x0, 12x8' },
    { bed_exclude_volumes: '0x0, 1x1, 2x2' },
    { bed_exclude_volumes: '|' },
    { bed_exclude_volumes: clip, bed_exclude_volume_mode: 'toolhead_offset' },
    { bed_exclude_volume_mode: 'per_extruder', extruder_bed_exclude_volumes: [clip] },
    { bed_exclude_volumes: clip, extruder_clearance_radius: '-3' },
    { bed_exclude_volume_mode: 'per_extruder', extruder_bed_exclude_volumes: clip },
  ])('refuses malformed geometry and unresolved tool-specific settings: %j', (machine) => {
    expect(obstacleSettings({ printable_height: '200', ...machine }).obstacleUnsupported).toBe(true);
  });
});

describe('default-process brim settings', () => {
  it('reserves the automatic brim upper bound even when the supplied width is smaller or absent', () => {
    expect(brimSettings({ brim_type: 'auto_brim', brim_width: '4', brim_object_gap: '0.1' })).toEqual({
      brimClearance: 18.1,
    });
    expect(brimSettings({ brim_type: 'auto_brim', brim_width: '0' })).toEqual({ brimClearance: 18 });
    expect(brimSettings({ brim_width: '4' })).toEqual({ brimClearance: 18 });
    expect(brimSettings({})).toEqual({ brimClearance: 18 });
  });

  it('uses supplied manual brim widths and leaves explicit no-brim presets clear', () => {
    expect(brimSettings({ brim_type: 'outer_only', brim_width: '4', brim_object_gap: '0.1' })).toEqual({
      brimClearance: 4.1,
    });
    expect(brimSettings({ brim_type: 'no_brim', brim_width: '4' })).toEqual({ brimClearance: 0 });
    expect(brimSettings({ brim_width: '-4' })).toEqual({ obstacleUnsupported: true });
  });
});
