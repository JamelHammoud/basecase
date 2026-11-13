import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNodeConverter } from './nodeHost/client.mjs';
import { openCadFile } from './openCadFile.mjs';

const FIXTURE = path.resolve('verify', 'fixtures', 'cadimport', 'two-bodies-inch.step');
const INCH = 25.4;
const converter = createNodeConverter();
const fixtureBytes = () => new Uint8Array(fs.readFileSync(FIXTURE));

const sorted = (v) => [...v].sort((a, b) => a - b);

function expectNear(actual, expected) {
  actual.forEach((v, i) => expect(Math.abs(v - expected[i]), `${actual} vs ${expected}`).toBeLessThan(0.1));
}

describe('opening a STEP file', () => {
  it('turns each body of a multi-body inch STEP into its own mesh, in mm, named and coloured', async () => {
    const { bodies, data } = await openCadFile(converter, { name: 'stand.step', bytes: fixtureBytes() });

    expect(bodies.map((b) => b.name)).toEqual(['Base Plate', 'Post']);
    expect(bodies.map((b) => b.color)).toEqual(['#cc3333', '#3366cc']);
    expectNear(sorted(bodies[0].size), sorted([2 * INCH, 1 * INCH, 0.25 * INCH]));
    expectNear(sorted(bodies[1].size), sorted([0.5 * INCH, 0.5 * INCH, 1 * INCH]));
    expectNear(bodies[0].size, [2 * INCH, 0.25 * INCH, 1 * INCH]);
    expectNear([bodies[1].center[0] - bodies[0].center[0]], [3 * INCH]);
    expect(data).toHaveLength(bodies.reduce((n, b) => n + (b.vertices + b.triangles) * 12, 0));
  });

  it('opens IGES and STP names through the same converter, and nothing else', async () => {
    await expect(openCadFile(converter, { name: 'stand.STP', bytes: fixtureBytes() })).resolves.toMatchObject({
      bodies: [{ name: 'Base Plate' }, { name: 'Post' }],
    });
    await expect(openCadFile(converter, { name: 'stand.stl', bytes: fixtureBytes() })).rejects.toThrow(/STEP/);
    await expect(openCadFile(null, { name: 'stand.step', bytes: fixtureBytes() })).rejects.toThrow(/desktop app/);
  });

  it('fails closed on a malformed STEP and keeps converting afterwards', async () => {
    const whole = fixtureBytes();
    const broken = [
      whole.slice(0, 3000),
      new TextEncoder().encode('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=CARTESIAN_POINT((((((((;\nENDSEC;'),
      Uint8Array.from({ length: 4096 }, (_, i) => (i * 7919) % 256),
      new Uint8Array(0),
    ];

    for (const bytes of broken) await expect(openCadFile(converter, { name: 'broken.step', bytes })).rejects.toThrow();

    expect((await openCadFile(converter, { name: 'stand.step', bytes: whole })).bodies).toHaveLength(2);
  });
});
