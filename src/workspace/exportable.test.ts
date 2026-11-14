import { describe, expect, it } from 'vitest';
import { makeSpec } from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import { makesClearanceHole } from '../utils/hardwareCutouts';
import { goesOnPlate, isExportedSolid } from './exportable';

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

describe('commands with something to act on', () => {
  it('exports and shares only visible solid parts', () => {
    expect(isExportedSolid(part({ id: 'box' }))).toBe(true);
    expect(isExportedSolid(part({ id: 'hidden', visible: false }))).toBe(false);
    expect(isExportedSolid(part({ id: 'hole', role: 'cutout' }))).toBe(false);
    expect(isExportedSolid(part({ id: 'photo', kind: 'image_plane' }))).toBe(false);
  });

  it('puts only printed parts that aren’t skipped on a plate', () => {
    expect(goesOnPlate(part({ id: 'bracket', kind: 'cad_part' }))).toBe(true);
    expect(goesOnPlate(part({ id: 'skipped', kind: 'cad_part', print: { skip: true } }))).toBe(false);
    expect(goesOnPlate(part({ id: 'servo', kind: 'component', componentId: 'feetech-sts3215' }))).toBe(false);
  });

  it('offers a clearance hole only for hardware that makes one', () => {
    const hardware = (type: Parameters<typeof makeSpec>[0]) =>
      part({ id: type, kind: 'hardware', hardware: makeSpec(type, { size: 'M3', length: 10 }) });

    expect(makesClearanceHole(hardware('socket_head'))).toBe(true);
    expect(makesClearanceHole(hardware('standoff_mf'))).toBe(true);
    expect(makesClearanceHole(hardware('standoff_ff'))).toBe(false);
    expect(makesClearanceHole(part({ id: 'box' }))).toBe(false);
  });
});
