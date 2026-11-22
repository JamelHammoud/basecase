import { createHash } from 'node:crypto';
import loadMujoco from '@mujoco/mujoco';
import { InferenceSession, env } from 'onnxruntime-web/wasm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { visionSignalValues } from '../cameras/visionSignals';
import { CaseLogicRun, compileCaseLogic } from '../cases/caseLogic';
import { gameLogic } from '../cases/fixtureGames';
import { signalShape } from '../cases/console/signalNames';
import { SimEngine } from '../sim/engine';
import { fixtureModel } from '../skills/fixtureModels';
import { VisionEngine } from '../vision/engine';
import type { VisionManifest } from '../vision/manifest';
import { scriptedDetectionOnnx, scriptedPixels } from '../vision/tracking/fixtures/scriptedOnnx';
import { framesOf, summarize, type ScriptedFrame, type Workflow } from '../vision/tracking/fixtures/scripts';
import { TrackingSession } from '../vision/tracking/session';
import { trackResult } from '../vision/tracking/trackResult';
import { WORKFLOWS } from '../vision/tracking/fixtures/workflows';
import type { VisionResult } from '../vision/types';

env.wasm.numThreads = 1;

const engine = new VisionEngine((bytes) => InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
const source = { scene: 'scene', kind: 'simulated' as const, id: 'source' };

function manifestOf(workflow: Workflow, bytes: Uint8Array): VisionManifest {
  return {
    version: 1,
    id: `scripted-${workflow.id.replaceAll(/[^a-z]+/gu, '-')}`,
    kind: 'detect',
    adapter: 'generic',
    classes: workflow.classes,
    input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
    model: {
      owner: 'example',
      repo: 'camera-fixture',
      revision: '0'.repeat(40),
      file: 'scripted.onnx',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    },
  };
}

async function loaded(workflow: Workflow) {
  const bytes = scriptedDetectionOnnx(workflow);
  const manifest = manifestOf(workflow, bytes);

  await engine.load(manifest, bytes);

  return manifest.id;
}

async function run(
  workflow: Workflow,
  options: { every?: number; session?: TrackingSession; camera?: string; stop?: number } = {},
) {
  const model = await loaded(workflow);
  const session = options.session ?? new TrackingSession();
  const camera = options.camera ?? 'front';
  const frames: ScriptedFrame[] = [];
  const results: VisionResult[] = [];
  const all = framesOf(workflow);

  for (const [index, frame] of all.entries()) {
    if (index % (options.every ?? 1) !== 0 || index >= (options.stop ?? Infinity)) continue;

    const result = await engine.infer(model, scriptedPixels(workflow, frame), {
      source,
      camera,
      timestamp: frame.timestamp,
    });

    frames.push(frame);
    results.push(trackResult(session, `${source.id}/${camera}:${model}`, workflow.regions, result));
  }

  return {
    frames,
    results,
    summary: summarize(
      workflow,
      frames,
      results.map((r) => r.tracking!),
    ),
  };
}

afterAll(() => engine.close());

describe('tracked detections from real inference on scripted camera frames', () => {
  it.each(WORKFLOWS.map((workflow) => [workflow.id, workflow] as const))('%s', async (_name, workflow) => {
    const { summary } = await run(workflow);

    expect(summary).toMatchObject(workflow.expect);
  });

  it('reads crossings, zone counts and dwell as the same signals a console, a Case contract and a Routine read', async () => {
    const workflow = WORKFLOWS.find((candidate) => candidate.id === 'doorway entry and exit')!;
    const { results } = await run(workflow);
    const values = visionSignalValues([results.at(-1)!], ['vision.front.zone.hall', 'vision.front.person.tracks']);
    const names = Object.keys(visionSignalValues(results.slice(-1), []));

    expect(values['vision.front.line.door.in']).toBe(1);
    expect(values['vision.front.line.door.out']).toBe(1);
    expect(values['vision.front.zone.hall.count']).toBe(0);
    expect(values['vision.front.zone.hall.dwell']).toBe(0);
    expect(values['vision.front.person.tracks']).toBe(0);

    for (const name of names)
      expect(signalShape(name, { declared: new Set(), probes: new Set(), inputs: new Set() })).toBe('number');

    const compiled = compileCaseLogic(gameLogic(3), { skills: [] });
    const run_ = await CaseLogicRun.start({
      plan: compiled.plan!,
      seconds: 3,
      engine: { setController: vi.fn() } as unknown as SimEngine,
      handBack: () => undefined,
      body: null,
    });

    run_.advance(100, {});
    run_.acceptVision(results.at(-1)!);
    run_.advance(200, {});
    expect(run_.cameraFacts()['vision.front.line.door.in']).toBe(1);
    expect(run_.cameraFacts()['vision.front.zone.hall.count']).toBe(0);
  });

  it('counts the same crossings on a source that delivers every second frame and on one that is paused', async () => {
    const workflow = WORKFLOWS.find((candidate) => candidate.id === 'conveyor part counting')!;
    const slow = await run(workflow, { every: 2 });
    const paused = await run(workflow, { stop: 40 });

    expect(slow.summary.crossings.gate).toEqual([4, 0]);

    const heldAt = visionSignalValues(paused.results.slice(-1));

    expect(visionSignalValues(paused.results.slice(-1))).toEqual(heldAt);
    expect(heldAt['vision.front.line.gate.in']).toBe(3);
  });

  it('keeps two cameras with identical zone and line names separate', async () => {
    const workflow = WORKFLOWS.find((candidate) => candidate.id === 'conveyor part counting')!;
    const session = new TrackingSession();
    const left = await run(workflow, { session, camera: 'left' });
    const right = await run(workflow, { session, camera: 'right', stop: 30 });
    const values = visionSignalValues([left.results.at(-1)!, right.results.at(-1)!]);

    expect(values['vision.left.line.gate.in']).toBe(4);
    expect(values['vision.right.line.gate.in']).toBeLessThan(4);
  });

  it('runs the same tracked results through a real MuJoCo Routine without changing its watchers', async () => {
    const workflow = WORKFLOWS.find((candidate) => candidate.id === 'conveyor part counting')!;
    const { results } = await run(workflow);
    const mj = await loadMujoco();
    const sim = new SimEngine(mj, fixtureModel('quad-servo'));

    try {
      const compiled = compileCaseLogic(gameLogic(3), { skills: [] });
      const logic = await CaseLogicRun.start({
        plan: compiled.plan!,
        seconds: 3,
        engine: sim,
        handBack: () => undefined,
        body: null,
      });

      logic.advance(100, {});

      for (const result of results.slice(0, 20)) logic.acceptVision(result);

      logic.advance(200, {});
      expect(Object.keys(logic.cameraFacts()).some((name) => name.startsWith('vision.front.line.gate'))).toBe(true);
    } finally {
      sim.dispose();
    }
  });
});
