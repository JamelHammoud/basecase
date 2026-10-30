import path from 'node:path';
import { root } from './harness.mjs';
import { STEP_OPS } from './replaySteps.mjs';

async function replayModelPart({ call, renderPart }, inp) {
  const { id, language = 'openscad', code, position, ...rest } = inp;
  const res = await renderPart(language, code);

  if (res.ok === false || res.error) return false;

  await call('apply', {
    ops: [
      {
        op: 'add',
        part: {
          id,
          shape: 'cad_part',
          position,
          ...rest,
          cad: { language, code, positions: res.positions, indices: res.indices, edges: res.edges, stats: res.stats },
        },
      },
    ],
  });

  return true;
}

async function replayStep(ctx, s) {
  if (/model_part/.test(s.name)) return replayModelPart(ctx, s.input);

  const match = STEP_OPS.find(([re]) => re.test(s.name));

  if (match) await ctx.call('apply', { ops: match[1](s.input) });

  return true;
}

export async function replayInStudio(studio, steps, { startScene } = {}) {
  const { renderPart } = await import(path.join(root, 'electron/cad-kernel/client.mjs'));
  const ctx = { call: studio.call, renderPart };

  await studio.page.evaluate(() => window.__studio.clear());

  if (startScene) await studio.page.evaluate((r) => window.__studio.load(r), startScene);

  let replayed = 0;

  for (const s of steps) if (await replayStep(ctx, s)) replayed++;

  await new Promise((r) => setTimeout(r, 4000));

  return { replayed, scene: await studio.page.evaluate(() => window.__studio.sceneRecord()) };
}
