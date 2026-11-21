import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { recommendBodyMotion } from './bodyMotion';
import { parkedBodyRun } from './bodyMotion.fixtures';
import { canonicalJson } from '../skills/hash';
import type { BodyMotionRequest } from './bodyMotionTypes';
import { SimEngine } from '../sim/engine';
import { simDeltas, fromMj } from '../sim/mjcfFrames';
import { Vector3 } from 'three';
import { replayBody } from './bodyReplay';
import { emptyBodyFit } from './bodyParameters';

it('recommends a retained arm motion with an isolated historical pose and predicted trace', async () => {
  const mj = await loadMujoco();
  const { request } = await bodyAnalysisScenario(mj, 'two-link masses');

  request.run = parkedBodyRun(request.model);

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  expect(result.parameters[0].distinguishability).not.toBe('distinguishable');

  const retained = JSON.parse(canonicalJson({ request, result, selected: [0] })) as BodyMotionRequest;
  const outcome = await recommendBodyMotion(retained, { mj });

  expect(outcome.kind, JSON.stringify(outcome)).toBe('recommended');

  if (outcome.kind !== 'recommended') throw new Error(outcome.kind);

  expect(outcome.preview.poses).toHaveLength(outcome.preview.times.length);
  expect(outcome.preview.parts.length).toBeGreaterThan(0);
  expect(outcome.preview.poses.flat().every(Number.isFinite)).toBe(true);

  const engine = new SimEngine(mj, request.model);
  let frame = 0;

  try {
    replayBody(
      {
        ...request,
        mj,
        engine,
        run: outcome.plan.run,
        onFrame: () => {
          const deltas = simDeltas(
            { ...request.model, bodies: outcome.preview.bodies },
            Float64Array.from(outcome.preview.poses[frame]),
          );

          for (const part of outcome.preview.parts) {
            const geom = Number(part.id.split(':')[1]);
            const mesh = Number(engine.model.geom_dataid[geom]);

            expect(Number(engine.model.geom_type[geom])).toBe(7);

            const start = Number(engine.model.mesh_vertadr[mesh]) * 3;
            const local = Array.from(engine.model.mesh_vert.slice(start, start + 3) as Float32Array);
            const position = engine.data.geom_xpos.slice(geom * 3, geom * 3 + 3) as Float64Array;
            const matrix = engine.data.geom_xmat.slice(geom * 9, geom * 9 + 9) as Float64Array;
            const world = position.map(
              (value, row) =>
                value + local.reduce((sum, coordinate, column) => sum + coordinate * matrix[row * 3 + column], 0),
            );
            const displayed = new Vector3()
              .fromArray(part.mesh!.positions)
              .add(new Vector3(...part.position))
              .applyMatrix4(deltas.get(part.id)!);

            expect(displayed.distanceTo(new Vector3(...fromMj(world[0], world[1], world[2])))).toBeLessThan(1e-6);
          }

          frame++;
        },
      },
      emptyBodyFit(),
    );
  } finally {
    engine.dispose();
  }
});
