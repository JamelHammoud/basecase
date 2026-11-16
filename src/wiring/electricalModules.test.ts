import { describe, expect, it } from 'vitest';
import { mappedGripper } from './electricalFixtures';
import { electricalProjection } from './electrical';
import { electricalPackage } from './electricalPackage';

describe('referenced power modules', () => {
  it('binds confirmed selected source records to manufacturer terminals without changing BOM choices', async () => {
    const scene = mappedGripper();
    const before = structuredClone(scene);
    const projection = electricalProjection(scene);
    const supply = projection.endpoints.find((end) => end.moduleId === 'meanwell-gst60a05-p1j')!;
    const fuse = projection.endpoints.find((end) => end.moduleId === 'littelfuse-0fha0001zxj')!;
    const powerSwitch = projection.endpoints.find((end) => end.moduleId === 'ck-7103syzqe')!;

    expect(supply.map?.pins.map((pin) => [pin.number, pin.function])).toEqual([
      ['CENTER', 'positive'],
      ['SLEEVE', 'ground'],
    ]);
    expect(fuse.map?.terminals).toEqual({ input: 'A', output: 'B' });
    expect(powerSwitch.map?.terminals).toEqual({ input: '2', output: '3' });
    expect(powerSwitch.map?.unused?.['1']).toContain('second throw');
    expect(projection.requirements.some((requirement) => requirement.code === 'fuse-rating')).toBe(true);
    expect(projection.completeness).toBe('draft');

    const made = await electricalPackage(scene);
    const report = JSON.parse(made.files['requirements.json']);

    expect(report.ruleExceptions).toEqual([
      { reference: powerSwitch.reference, pin: '1', reason: powerSwitch.map?.unused?.['1'] },
    ]);
    expect(made.files['robot.kicad_sch']).toContain('(no_connect');
    expect(scene).toEqual(before);
  });

  it('refuses absent evidence and detects a supply declaration that disagrees with the selected product', () => {
    const scene = mappedGripper();

    scene.project.sourced[0].sources = [];
    expect(electricalProjection(scene).endpoints.some((end) => end.moduleId === 'meanwell-gst60a05-p1j')).toBe(false);

    const changed = mappedGripper();

    changed.project.tether = { volts: 12, amps: 3 };

    const projection = electricalProjection(changed);

    expect(projection.requirements.some((requirement) => requirement.code === 'conflicting-source')).toBe(true);
    expect(projection.nets.filter((net) => net.function === 'positive').every((net) => net.nominalV === 5)).toBe(true);
  });
});
