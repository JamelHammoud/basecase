import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type Tether } from '../types/robotics';
import { applyBuildSettings } from '../workspace/agentBuildRequests';
import { buildBom } from './bom';
import { box, component, row, run, XM430, type Measures } from './engineering.fixtures';
import { suggestedTether } from './powerSources';

const servos = (componentId: string, n = 4) => {
  const parts = Array.from({ length: n }, (_, i) => component(`s${i}`, componentId, { massG: 82 }));
  const measures: Measures = Object.fromEntries(
    parts.map((p, i) => [p.id, box([i * 50, 100, 0], [i * 50 + 28, 146, 34])]),
  );

  return { parts, measures, joints: [] };
};

const tethered = (tether: Tether, componentId = XM430, n = 4) => run(servos(componentId, n), { tether });

describe('a robot on a tether', () => {
  it('passes the power checks with no battery when the supply suits the servos', () => {
    const r = tethered({ volts: 12, amps: 10 });

    expect(row(r, 'Battery')).toBeUndefined();
    expect(row(r, 'Servo voltage')).toMatchObject({
      status: 'pass',
      detail: 'The 12 V 10 A tether is inside every servo’s 10–14.8 V range',
    });
    expect(row(r, 'Supply current')?.status).toBe('pass');
    expect(row(r, 'Current and runtime')).toBeUndefined();
  });

  it('assumes a tether matched to the servos when the build has no battery', () => {
    const r = run(servos(XM430));

    expect(row(r, 'Battery')).toBeUndefined();
    expect(row(r, 'Servo voltage')?.detail).toBe('The 12 V 10 A tether is inside every servo’s 10–14.8 V range');
  });

  it('runs on the battery once one is in the build, whatever tether was set', () => {
    const build = servos(XM430);
    const withPack = { ...build, parts: [...build.parts, component('pack', 'ovonic-3s-2200-50c')] };
    const r = run(withPack, { tether: { volts: 24, amps: 10 } });

    expect(row(r, 'Supply current')).toBeUndefined();
    expect(row(r, 'Current and runtime')).toBeDefined();
  });

  it('fails a tether above the servos’ maximum', () => {
    expect(row(tethered({ volts: 24, amps: 10 }), 'Servo voltage')).toMatchObject({
      status: 'fail',
      detail: 'The 24 V 10 A tether gives 24 V, above the 14.8 V maximum of 4 servos',
    });
  });

  it('fails a tether that can’t carry the servos’ peak current', () => {
    const r = tethered({ volts: 12, amps: 1 }, XM430, 12);

    expect(row(r, 'Supply current')?.status).toBe('fail');
    expect(row(r, 'Supply current')?.detail).toMatch(/the tether gives 1 A$/);
  });

  it('counts a motor build on a tether the same way', () => {
    expect(row(tethered({ volts: 24, amps: 20 }, 'cubemars-ak60-6', 2), 'Battery')).toBeUndefined();
  });

  it('suggests a common supply voltage inside every servo’s range', () => {
    expect(suggestedTether(servos(XM430).parts)).toEqual({ volts: 12, amps: 10 });
    expect(suggestedTether(servos('feetech-sts3250').parts).volts).toBe(12);
  });

  it('puts the supply and its wiring on the bill of materials until a battery joins the build', () => {
    const { parts, measures } = servos(XM430);
    const keys = (scene: typeof parts) =>
      buildBom({ parts: scene, project: DEFAULT_PROJECT, purchases: {}, measures }).lines.map((l) => l.key);

    expect(keys(parts)).toEqual(
      expect.arrayContaining(['supply:dc-bench-supply', 'supply:blade-fuse-holder', 'supply:wire-18awg-silicone']),
    );
    expect(keys([...parts, component('pack', 'ovonic-3s-2200-50c')])).not.toContain('supply:dc-bench-supply');
  });

  it('lets the agent set and clear the tether', () => {
    const set = applyBuildSettings(DEFAULT_PROJECT, { tether: { volts: 12, amps: 10 } }).next;

    expect(set.tether).toEqual({ volts: 12, amps: 10 });
    expect(applyBuildSettings(set, { tether: { volts: 0, amps: 0 } }).next.tether).toBeUndefined();
  });
});
