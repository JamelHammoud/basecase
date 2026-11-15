import { afterEach, describe, expect, it, vi } from 'vitest';
import * as components from '../data/components';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { ScenePart } from '../types/robotics';
import { component, part, project } from './engineering.fixtures';
import { servoParts, servoRegulator, servoSource, servoSupplyVolts } from './engineeringPower';
import * as powerSources from './powerSources';
import { seeded } from './seeded';

type PowerScene = Parameters<typeof servoSource>[0];

const actuatorsIn = (ctx: PowerScene) =>
  [
    ...new Set(ctx.servos.map((p) => components.actuatorOf(p.componentId!, p.componentVariant)).filter(Boolean)),
  ] as components.ActuatorSpec[];

const outOfRange = (act: components.ActuatorSpec, source: powerSources.PowerSource) =>
  source.battery.fullV > act.volts[1] + 1e-6 || source.battery.fullV < act.volts[0] - 1e-6;

function referenceRail(ctx: PowerScene, source: powerSources.PowerSource, acts = actuatorsIn(ctx)) {
  return powerSources
    .sceneRegulators(ctx.parts)
    .filter(
      ({ regulator: r }) =>
        acts.every((a) => r.vout >= a.volts[0] && r.vout <= a.volts[1]) &&
        source.battery.fullV <= r.vinMax &&
        source.battery.nominalV >= r.vinMin,
    )
    .sort((a, b) => b.regulator.vout - a.regulator.vout || b.regulator.ioutA - a.regulator.ioutA)[0];
}

function referenceSource(ctx: PowerScene) {
  const ranked = powerSources.findPowerSources(ctx).map((source) => {
    const acts = actuatorsIn(ctx);
    const rank = acts.some((act) => outOfRange(act, source)) ? 2 : 0;

    return { source, rank: rank && referenceRail(ctx, source, acts) ? 1 : rank };
  });

  return (
    ranked.sort((a, b) => a.rank - b.rank || a.source.name.localeCompare(b.source.name))[0]?.source ??
    powerSources.tetherSource(ctx)
  );
}

function referenceSelection(ctx: PowerScene) {
  const source = referenceSource(ctx);
  const rail =
    source && actuatorsIn(ctx).some((act) => outOfRange(act, source)) ? referenceRail(ctx, source) : undefined;

  return { source, rail, volts: rail?.regulator.vout ?? source?.battery.nominalV };
}

const selection = (ctx: PowerScene) => ({
  source: servoSource(ctx),
  rail: servoRegulator(ctx),
  volts: servoSupplyVolts(ctx),
});

const context = (parts: ScenePart[], settings = project()): PowerScene => ({
  parts,
  project: settings,
  servos: servoParts(parts),
});

const catalog = Object.values(components.COMPONENT_BY_ID);
const sourceParts = catalog.filter((c) => c.battery || c.holder);
const railParts = catalog.filter((c) => c.regulator);
const actuatorParts = catalog.filter((c) => c.actuator || c.group === 'Servos');
const supplies = Object.values(SUPPLY_BY_ID).filter((s) => s.battery);

function mixedScene(seed: number) {
  const random = seeded(seed);
  const parts = Array.from({ length: Math.floor(random() * 24) }, (_, index) => {
    const pool = [sourceParts, railParts, actuatorParts][index % 3];
    const chosen = pool[Math.floor(random() * pool.length)];
    const variant = chosen.variants?.[Math.floor(random() * (chosen.variants.length + 1))]?.id;

    return component(`part-${index}`, chosen.id, { componentVariant: variant });
  });
  const supply = supplies[Math.floor(random() * supplies.length)];

  if (seed % 4 === 0) parts.push(part('supply', { supplyId: supply.id }));

  return context(
    parts,
    project({
      tether: { volts: 5 + random() * 45, amps: 10 },
      extras: seed % 3 === 0 ? [{ key: `supply:${supply.id}`, qty: 1 }] : [],
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

it('preserves complete power selections across catalog mixtures, reversals and later edits', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const scene = mixedScene(seed);
    const snapshot = structuredClone(scene);
    const first = selection(scene);

    expect(first).toEqual(referenceSelection(scene));
    expect(scene).toEqual(snapshot);

    scene.parts.reverse();

    expect(selection(scene)).toEqual(referenceSelection(scene));

    scene.parts = scene.parts.filter((p) => !powerSources.drivesJoint(p));
    scene.parts.push(
      component('new-rail', 'pololu-d36v50f6'),
      component('new-pack', 'ovonic-4s-2200-35c'),
      component('new-servo', 'feetech-sts3215', { componentVariant: 'c001' }),
    );
    scene.servos = servoParts(scene.parts);

    expect(selection(scene)).toEqual(referenceSelection(scene));
    expect(first).toEqual(referenceSelection(snapshot));
  }
});

it('keeps direct supplies ahead of regulated supplies and regulated supplies ahead of incompatible ones', () => {
  const servo = component('servo', 'dynamixel-xm430-w350');
  const low = component('low', 'ovonic-2s-2200-50c');
  const high = component('high', 'ovonic-6s-5000-120c');
  const direct = component('direct', 'ovonic-3s-2200-50c');
  const rail = component('rail', 'pololu-d36v50f12');

  expect(components.COMPONENT_BY_ID[high.componentId!]?.battery).toBeDefined();
  expect(servoSource(context([servo, low, high, direct, rail]))?.battery.nominalV).toBeCloseTo(11.1);
  expect(servoSource(context([servo, low, high, rail]))?.battery.nominalV).toBeCloseTo(22.2);
  expect(servoRegulator(context([servo, low, high, rail]))?.id).toBe('rail');
  expect(selection(context([servo, low, high]))).toEqual(referenceSelection(context([servo, low, high])));
  expect(servoSource(context([servo, high, low]))?.name).toBe(components.COMPONENT_BY_ID[low.componentId!].name);
});

it('selects the highest rail voltage, then current, preserving the first exact tie', () => {
  const servo = component('servo', 'feetech-sts3215', { componentVariant: 'c001' });
  const pack = component('pack', 'ovonic-3s-2200-50c');
  const lowCurrent = component('low-current', 'pololu-s13v20f5');
  const highCurrent = component('high-current', 'pololu-d36v50f5');
  const tie = component('tie', 'pololu-d36v50f5');
  const higherVoltage = component('higher-voltage', 'pololu-d36v50f6');

  expect(servoRegulator(context([servo, pack, lowCurrent, highCurrent, tie]))?.id).toBe('high-current');
  expect(servoRegulator(context([servo, pack, tie, highCurrent, lowCurrent]))?.id).toBe('tie');
  expect(servoRegulator(context([servo, pack, highCurrent, higherVoltage]))?.id).toBe('higher-voltage');
});

it('keeps voltage tolerances, regulator input boundaries and empty or unknown actuator behavior', () => {
  const servo = component('servo', 'feetech-sts3215', { componentVariant: 'c001' });
  const rails = railParts.map((c) => component(c.id, c.id));
  const bounds = [
    ...components.actuatorOf(servo.componentId!, servo.componentVariant)!.volts,
    ...railParts.flatMap((c) => [c.regulator!.vinMin, c.regulator!.vinMax]),
  ];

  for (const bound of bounds) {
    for (const offset of [-2e-6, -1e-6, 0, 1e-6, 2e-6]) {
      const scene = context([servo, ...rails], project({ tether: { volts: bound + offset, amps: 10 } }));

      expect(selection(scene)).toEqual(referenceSelection(scene));
    }
  }

  for (const parts of [
    [],
    [component('unknown', 'unknown-servo')],
    [component('missing-variant', 'feetech-sts3215')],
  ]) {
    expect(selection(context(parts))).toEqual(referenceSelection(context(parts)));
  }
});

describe.each([300, 600])('power-source preparation with %i candidates', (count) => {
  it('reads actuator models and scene regulators once for the entire source search', () => {
    const servos = Array.from({ length: 20 }, (_, i) =>
      component(`servo-${i}`, 'feetech-sts3215', { componentVariant: 'c001' }),
    );
    const packs = Array.from({ length: count }, (_, i) => component(`pack-${i}`, 'ovonic-3s-2200-50c'));
    const rails = railParts.map((c) => component(c.id, c.id));
    const scene = context([...servos, ...packs, ...rails]);
    const actuatorReads = vi.spyOn(components, 'actuatorOf');
    const regulatorScans = vi.spyOn(powerSources, 'sceneRegulators');
    const expected = referenceSource(scene);

    expect(actuatorReads).toHaveBeenCalledTimes(count * servos.length);
    expect(regulatorScans).toHaveBeenCalledTimes(count);
    actuatorReads.mockClear();
    regulatorScans.mockClear();

    expect(servoSource(scene)).toEqual(expected);
    expect(actuatorReads).toHaveBeenCalledTimes(servos.length);
    expect(regulatorScans).toHaveBeenCalledTimes(1);
  });

  it('prepares no regulator list when every source can power the actuators directly', () => {
    const scene = context([
      component('servo', 'dynamixel-xm430-w350'),
      ...Array.from({ length: count }, (_, i) => component(`pack-${i}`, 'ovonic-3s-2200-50c')),
    ]);
    const regulatorScans = vi.spyOn(powerSources, 'sceneRegulators');

    expect(servoSource(scene)?.battery.fullV).toBeCloseTo(12.6);
    expect(regulatorScans).not.toHaveBeenCalled();
  });
});
