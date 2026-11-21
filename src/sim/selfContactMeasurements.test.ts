import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { selfContactDesigns, type SelfContactDesign } from './fixtures/selfContactDesigns';
import { contactJob } from './contactPreparationClient';
import { prepareContactJob, type ContactHullEntry } from './contactPreparation';
import { buildMjcf } from './mjcf';
import { SimEngine } from './engine';
import type { MjcfInput, SimModel } from './mjcfTypes';

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

async function preparation(input: MjcfInput, enabled: boolean) {
  const times: number[] = [];
  let model: SimModel | undefined;
  let cache: ContactHullEntry[] = [];
  let hullBytes = 0;
  let sourceBytes = 0;

  for (let i = 0; i < 3; i++) {
    const started = performance.now();

    if (enabled) {
      const result = await prepareContactJob({ ...contactJob(input), cache });

      model = result.model;
      cache = result.cache;
      hullBytes = result.metrics.hullBytes;
      sourceBytes = result.metrics.sourceBytes;
    } else model = buildMjcf(input);

    times.push(performance.now() - started);
  }

  return { model: model!, preparationMs: median(times), hullBytes, sourceBytes };
}

async function measurement(fixture: SelfContactDesign, enabled: boolean) {
  const input = enabled ? fixture.input : { ...fixture.input, project: { ...fixture.input.project, selfContact: {} } };
  const before = process.memoryUsage();
  const prepared = await preparation(input, enabled);
  const model = prepared.model;
  const mj = await loadMujoco();
  const engine = new SimEngine(mj, model);
  const times: number[] = [];

  try {
    for (let repeat = 0; repeat < 3; repeat++) {
      engine.reset();
      engine.setController({ kind: 'hold', values: fixture.reference });

      const started = performance.now();

      for (let i = 0; i < 100; i++) engine.step(0.02);

      times.push(performance.now() - started);
    }

    const after = process.memoryUsage();
    const bodies = model.bodies.filter((body) => body.robot).length;
    const exclusions = [...model.xml.matchAll(/<exclude\b/g)].length;

    return {
      enabled,
      preparationMs: prepared.preparationMs,
      eligibleBodyPairs: enabled ? (bodies * (bodies - 1)) / 2 - exclusions : 0,
      eligibleGeomPairs: eligibleGeomPairs(engine, mj),
      hullBytes: prepared.hullBytes,
      sourceBytes: prepared.sourceBytes,
      workerRssBefore: before.rss,
      workerRssAfter: after.rss,
      workerHeapAfter: after.heapUsed,
      stepsPerSecond: 1_000_000 / median(times),
    };
  } finally {
    engine.dispose();
  }
}

function eligibleGeomPairs(engine: SimEngine, mj: MainModule): number {
  const { model, sim } = engine;
  const bodyId = (name: string) => mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, name);
  const robots = new Map(sim.bodies.map((body) => [bodyId(body.name), body.robot]));
  const key = (first: number, second: number) => `${Math.min(first, second)}/${Math.max(first, second)}`;
  const excluded = new Set(
    [...sim.xml.matchAll(/<exclude body1="([^"]*)" body2="([^"]*)"/g)].map((match) =>
      key(bodyId(match[1]), bodyId(match[2])),
    ),
  );
  let count = 0;

  for (let first = 0; first < model.ngeom; first++) {
    const a = model.geom_bodyid[first];
    const robot = robots.get(a);

    if (!robot) continue;

    for (let second = first + 1; second < model.ngeom; second++) {
      const b = model.geom_bodyid[second];
      const masks =
        (model.geom_contype[first] & model.geom_conaffinity[second]) |
        (model.geom_contype[second] & model.geom_conaffinity[first]);

      if (a !== b && robots.get(b) === robot && masks && !excluded.has(key(a, b))) count++;
    }
  }

  return count;
}

it.each(selfContactDesigns)('measures enabled and disabled $name on the production replay workload', async (spec) => {
  const fixture = spec.build();
  const disabled = await measurement(fixture, false);
  const enabled = await measurement(fixture, true);

  expect(enabled.eligibleBodyPairs).toBeGreaterThan(0);
  expect(enabled.eligibleGeomPairs).toBeGreaterThan(0);
  expect(disabled.eligibleGeomPairs).toBe(0);
  expect(enabled.stepsPerSecond).toBeGreaterThan(0);
  process.stdout.write(`self-contact-measurement ${JSON.stringify({ name: spec.name, disabled, enabled })}\n`);
});
