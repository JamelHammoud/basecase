import { describe, expect, it } from 'vitest';
import type { FastenerChain } from '../assembly/assemblyTypes';
import { component, joint, part, project } from './engineering.fixtures';
import type { CheckContext, JointLoad, ServoLine } from './engineeringTypes';
import { strengthPlans } from './engineeringStrength';
import { StrengthPaths } from './strengthPaths';

const output: ServoLine = { point: [0, 0, 0], axis: [0, 2, 0] };

function chain(id: string, stack: string[], receiver?: string): FastenerChain {
  return {
    id,
    stack,
    endsIn: { kind: receiver ? 'printed' : 'none', id: receiver },
    axis: [0, 1, 0],
    tip: [0, 0, 0],
    top: [0, 10, 0],
    d: 3,
    headR: 2,
    engagementMm: 3,
    needMm: null,
    problems: [],
  };
}

function context(screws: FastenerChain[]): CheckContext {
  const parts = [
    component('servo', 'feetech-sts3215'),
    component('motor', 'feetech-sts3215'),
    part('washer', { kind: 'hardware' }),
    ...['a', 'b', 'c', 'd', 'e', 'leaf'].map((id) => part(id)),
  ];
  const settings = project();

  return {
    input: { parts, project: settings, measures: {}, servoOutputs: { servo: output }, chains: { screws, sleeves: [] } },
    parts,
    project: settings,
    measures: {},
    joints: [],
    byPart: new Map(parts.map((p) => [p.id, p])),
    byId: new Map(),
    all: { grams: 0, com: [0, 0, 0] },
    onFloor: [],
    servos: [],
    bodies: [],
  };
}

const loadFor = (actuators: string[]): JointLoad => ({
  joint: joint('joint', { actuators }),
  massG: 0,
  swingNm: 0,
  stanceNm: 0,
  loadNm: 4,
  kind: 'hold',
  status: 'pass',
});

const pathIds = (paths: ReturnType<StrengthPaths['from']>) =>
  paths.map(({ part: p, inScrews, outScrews }) => [p.id, inScrews.map((c) => c.id), outScrews.map((c) => c.id)]);

describe('Strength load paths', () => {
  it('retains branching order, duplicate contacts, cycles and the three-hop limit', () => {
    const screws = [
      chain('horn', ['servo', 'a', 'a'], 'a'),
      chain('ab', ['a'], 'b'),
      chain('ac', ['a', 'c']),
      chain('bd', ['b', 'd']),
      chain('cd', ['c', 'd']),
      chain('de', ['d', 'e']),
      chain('back', ['d', 'a']),
      chain('end', ['e', 'leaf']),
      chain('washer', ['a', 'washer']),
    ];
    const ctx = context(screws);
    const snapshot = structuredClone(ctx);
    const paths = new StrengthPaths(ctx, screws).from('servo', output);

    expect(pathIds(paths)).toEqual([
      ['a', ['horn'], ['ab', 'ac', 'back']],
      ['b', ['ab'], ['bd']],
      ['c', ['ac'], ['cd']],
      ['d', ['back'], ['bd', 'cd', 'de']],
      ['d', ['bd', 'cd'], ['de', 'back']],
      ['e', ['de'], ['end']],
    ]);
    expect(ctx).toEqual(snapshot);
    expect(paths[0].inScrews[0]).toBe(screws[0]);
    expect(paths[0].part).toBe(ctx.byPart.get('a'));
  });

  it('keeps horn boundaries, terminal links, materials and component barriers', () => {
    const horn = chain('horn', ['servo'], 'a');
    const screws = [
      horn,
      chain('hold', ['a', 'motor']),
      chain('past-component', ['motor', 'b']),
      chain('end', ['b', 'c']),
    ];
    const ctx = context(screws);

    horn.tip = [12, 30, 0];
    expect(pathIds(new StrengthPaths(ctx, screws).from('servo', output))).toEqual([['a', ['horn'], ['hold']]]);
    horn.tip[0] = 12 + 1e-8;
    expect(new StrengthPaths(ctx, screws).from('servo', output)).toEqual([]);
    horn.tip[0] = 0;
    horn.axis = [1, 0, 0];
    expect(new StrengthPaths(ctx, screws).from('servo', output)).toEqual([]);
    horn.axis = [0, -1, 0];
    ctx.byPart.get('a')!.printMaterial = 'TPU';
    expect(new StrengthPaths(ctx, screws).from('servo', output)).toEqual([]);
    ctx.byPart.get('a')!.printMaterial = 'PLA';
    screws.splice(1);
    expect(new StrengthPaths(ctx, screws).from('servo', output)).toEqual([]);
  });

  it('shares preparation across loads and servos and rebuilds after receiver edits', () => {
    const horn = chain('horn', ['servo', 'motor'], 'a');
    const hold = chain('hold', ['a'], 'b');
    const ctx = context([horn, hold]);
    const load = loadFor(['servo', 'motor']);

    ctx.input.servoOutputs.motor = output;

    const plans = strengthPlans(ctx, [load, load]);

    expect(plans).toHaveLength(4);
    expect(plans.map((p) => p.job.key)).toEqual(['joint|servo|a', 'joint|motor|a', 'joint|servo|a', 'joint|motor|a']);
    expect(plans[0].job).toMatchObject({
      part: 'a',
      material: 'PETG',
      infillPct: 15,
      load: { torqueNmm: 2000, axis: [0, 1, 0], screws: [{ from: horn.tip, to: horn.top, radius: 3 }] },
      holds: [{ from: hold.tip, to: hold.top, radius: 3 }],
    });
    hold.endsIn.id = 'washer';
    expect(strengthPlans(ctx, [load])).toEqual([]);
    expect(plans[0].job.holds).toHaveLength(1);
  });

  it('reads each screw stack once across repeated servo searches', () => {
    for (const count of [300, 600]) {
      let reads = 0;
      const screws = Array.from({ length: count }, (_, i) => {
        const screw = chain(`screw-${i}`, ['unrelated']);
        const stack = screw.stack;

        Object.defineProperty(screw, 'stack', {
          get: () => {
            reads += 1;

            return stack;
          },
        });

        return screw;
      });

      screws.push(chain('horn', ['servo', 'a']), chain('hold', ['a', 'b']));

      const ctx = context(screws);

      expect(strengthPlans(ctx, [])).toEqual([]);
      expect(reads).toBe(0);
      expect(
        strengthPlans(
          ctx,
          Array.from({ length: 20 }, () => loadFor(['servo'])),
        ),
      ).toHaveLength(20);
      expect(reads).toBe(count);
    }
  });
});
