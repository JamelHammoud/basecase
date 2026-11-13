import { beforeEach, describe, expect, it, vi } from 'vitest';

const stage = { parts: [], items: [], coplanar: [], calls: [] };

vi.mock('./shared.mjs', async () => {
  const { z } = await import('zod');

  return {
    VIEW: z.string(),
    bridge: async (kind) => {
      stage.calls.push(kind);

      if (kind === 'snapshot') return { parts: stage.parts };

      return kind === 'interference' ? { items: stage.items, coplanar: stage.coplanar, twins: [] } : {};
    },
    fail: (err) => ({ content: [{ type: 'text', text: String(err) }] }),
    text: (t) => ({ content: [{ type: 'text', text: t }] }),
  };
});
vi.mock('./autoCompare.mjs', () => ({ autoCompareText: async () => '', blockOutPending: () => false }));
vi.mock('./imageCaps.mjs', () => ({ imageCaps: () => ({}) }));

const box = (id, min, max, over = {}) => ({ id, kind: 'cad (openscad)', role: 'solid', bounds: { min, max }, ...over });
const onFloor = (id, x = 0) => box(id, [x, 0, 0], [x + 10, 10, 10]);
const clash = (i) => ({ a: `a${i}`, b: `b${i}`, depthMm: 5, fraction: 0.2 });

async function loaded() {
  vi.resetModules();

  return (await import('./inspectTools.mjs')).checkScene;
}

const report = async (tool) => (await tool.handler()).content[0].text;

async function check(parts, items = []) {
  Object.assign(stage, { parts, items, coplanar: [] });

  return report(await loaded());
}

describe('check_scene', () => {
  beforeEach(() => Object.assign(stage, { parts: [], items: [], coplanar: [], calls: [] }));

  it("doesn't count a through-hole cutout that overshoots the plate as below the floor", async () => {
    const text = await check([
      box('plate', [0, 0, 0], [100, 100, 5]),
      box('hole', [45, 45, -1], [55, 55, 6], { role: 'cutout', kind: 'hole_cylinder' }),
    ]);

    expect(text).toContain('No issues found.');
  });

  it('still reports a solid below the floor', async () => {
    expect(await check([box('foot', [0, 0, -20], [10, 10, 5])])).toContain('foot: 20.0 mm below the floor');
  });

  it('reports parts that only touch each other above the floor as one floating group', async () => {
    const text = await check([box('a', [0, 0, 500], [20, 20, 520]), box('b', [20, 0, 500], [40, 20, 520])]);

    expect(text).toContain('a, b: floating 500.0 mm above the floor, touching only each other');
  });

  it('reports a lone part above the floor', async () => {
    expect(await check([onFloor('base'), box('lost', [100, 0, 50], [110, 10, 60])])).toContain(
      'lost: floating (touches nothing)',
    );
  });

  it('keeps a chain of touching parts connected to the floor', async () => {
    const text = await check([
      onFloor('base'),
      box('mid', [0, 0, 10], [10, 10, 20]),
      box('top', [0, 0, 20], [10, 10, 30]),
    ]);

    expect(text).toContain('No issues found.');
  });

  it("doesn't let a cutout hold a part up", async () => {
    const text = await check([
      onFloor('base'),
      box('hole', [0, 0, 5], [10, 10, 40], { role: 'cutout', kind: 'hole_cylinder' }),
      box('lost', [0, 0, 30], [10, 10, 40]),
    ]);

    expect(text).toContain('lost: floating');
  });

  it('counts a hidden part as what a visible part rests on', async () => {
    const text = await check([
      box('stand', [0, 0, 0], [10, 10, 50], { hidden: true }),
      box('tray', [0, 0, 50], [10, 10, 60]),
    ]);

    expect(text).toContain('No issues found.');
  });

  it("doesn't call batteries, sculpts, custom models or booleans block-outs, but does a plain box", async () => {
    const text = await check([
      box('battery', [0, 0, 0], [10, 10, 10], { kind: 'box', supply: 'supply:lipo-3s-2200' }),
      box('sculpted', [10, 0, 0], [20, 10, 10], { kind: 'sculpt_mesh' }),
      box('logo', [20, 0, 0], [30, 10, 10], { kind: 'custom_model' }),
      box('stand-in', [30, 0, 0], [40, 10, 10], { kind: 'box' }),
      box('bracket', [40, 0, 0], [50, 10, 10], { kind: 'boolean (subtract)' }),
    ]);

    expect(text).toContain(
      '1 solid parts are still block-out primitives (replace each with model_part or a catalog part): stand-in',
    );
  });

  it('leaves the share out when no sampled point sat inside', async () => {
    const text = await check([onFloor('a')], [{ a: 'rod', b: 'plate', depthMm: 2.5, fraction: 0 }]);

    expect(text).toContain('rod ↔ plate: pass through each other, up to 2.5 mm deep. Cut');
  });

  it('says the share when points sat inside', async () => {
    const text = await check([onFloor('a')], [clash(1)]);

    expect(text).toContain('up to 5 mm deep (20% of the smaller part inside)');
  });

  it('says how many lines it left out', async () => {
    const parts = Array.from({ length: 60 }, (_, i) => box(`p${i}`, [i * 100, 0, 50], [i * 100 + 10, 10, 60]));
    const text = await check(parts);

    expect(text).toContain('- …and 20 more lines');
  });

  it('counts interferences past the first 30', async () => {
    const text = await check(
      [onFloor('a')],
      Array.from({ length: 33 }, (_, i) => clash(i)),
    );

    expect(text).toContain('- …and 3 more interferences');
  });

  it("doesn't call anything fixed when new clashes only push old ones off the list", async () => {
    const tool = await loaded();
    const first = Array.from({ length: 30 }, (_, i) => clash(i));

    Object.assign(stage, { parts: [onFloor('a')], items: first, coplanar: [] });
    await report(tool);
    Object.assign(stage, { items: [...Array.from({ length: 5 }, (_, i) => clash(100 + i)), ...first] });

    const text = await report(tool);

    expect(text).toContain('New since the last check (5):');
    expect(text).not.toContain('Fixed since the last check');
  });

  it('counts a clash that is really gone as fixed', async () => {
    const tool = await loaded();

    Object.assign(stage, { parts: [onFloor('a')], items: [clash(1), clash(2)], coplanar: [] });
    await report(tool);
    Object.assign(stage, { items: [clash(1)] });

    expect(await report(tool)).toContain('Fixed since the last check: 1.');
  });

  it('waits for a part still being written before reading the scene', async () => {
    const tool = await loaded();
    const { trackWrite } = await import('./pendingWrites.mjs');
    let finish;

    trackWrite(['late'], new Promise((resolve) => (finish = resolve)));
    Object.assign(stage, { parts: [onFloor('a')], calls: [] });

    const running = tool.handler();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(stage.calls).toEqual([]);
    finish();
    await running;
    expect(stage.calls).toContain('snapshot');
  });
});
