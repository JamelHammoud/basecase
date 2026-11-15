import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraStageJob } from '../cameras/cameraStage';
import type { VisionResult } from '../vision/types';
import { compileRoutine } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';
import { greetingRoutine } from './greeting';
import { runRenderedVisionJob } from './renderedVisionRun';
import type { Scenario } from './scenarioTypes';

const stage = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn() }));

vi.mock('../cameras/cameraStage', () => ({ loadCameraStage: stage.load, renderCameraFrame: stage.render }));

const scenario: Scenario = {
  tier: 'L2',
  covers: 'multi-view rendered inference',
  world: [],
  mocks: { cup: true },
  faults: [],
  seconds: 1,
  expect: [{ saidExactly: ['Cup'] }],
};
const job = {
  parts: [],
  world: [],
  model: null,
  views: [{ key: 'scene' }, { key: 'wrist' }],
} as unknown as CameraStageJob;

function plan() {
  const routine = greetingRoutine();

  routine.watchers = [
    { id: 'cup', model: 'object-detection', label: 'cup', rateHz: 5, maxAgeMs: 500, publishes: { type: 'boolean' } },
  ];
  routine.reactions = [
    {
      id: 'notice',
      when: { fact: 'cup', is: true },
      cooldownMs: 1000,
      onRetrigger: 'ignore',
      body: 'keepGoing',
      steps: [{ kind: 'say', text: 'Cup', timeoutMs: 1000, onTimeout: [], onFail: [] }],
    },
  ];

  const compiled = compileRoutine(routine, { skills: FIXTURE_SKILLS });

  expect(compiled.ok).toBe(true);

  return compiled.plan!;
}

function inferencePort(detected: boolean) {
  const target = {
    onmessage: null,
    onmessageerror: null,
    close: vi.fn(),
    start: vi.fn(),
    postMessage: vi.fn(),
  } as unknown as MessagePort;

  vi.mocked(target.postMessage).mockImplementation((message) => {
    if (message.type !== 'frame') return;

    const result: VisionResult = {
      modelId: message.modelId,
      camera: message.camera,
      timestamp: message.timestamp,
      width: 640,
      height: 480,
      detections: [],
    };

    if (detected && message.camera.endsWith(':wrist'))
      result.detections.push({ label: 'cup', score: 0.9, box: [0, 0, 1, 1] });

    queueMicrotask(() => target.onmessage?.call(target, { data: { type: 'result', result } } as MessageEvent));
  });

  return target;
}

beforeEach(() => {
  vi.clearAllMocks();
  stage.load.mockResolvedValue(true);
  stage.render.mockImplementation(({ keys }) =>
    Object.fromEntries(keys.map((key: string) => [key, { close: vi.fn() }])),
  );
});

describe('rendered L2 worker job', () => {
  it('feeds every rendered view into the actual WASM coordinator and keeps its 50 Hz clock', async () => {
    const port = inferencePort(true);
    const result = await runRenderedVisionJob(
      { plan: plan(), scenario, stage: job, port, cameraPrefix: 'routine-l2:run:' },
      vi.fn(),
    );

    expect(result.passed).toBe(true);
    expect(result.said).toEqual(['Cup']);
    expect(result.maxControlGapMs).toBe(20);
    expect(result.controlTicks).toBe(51);
    expect(stage.render).toHaveBeenCalledTimes(12);
    expect(vi.mocked(port.postMessage).mock.calls.filter(([message]) => message.type === 'frame')).toHaveLength(12);
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'detach' });
    expect(port.close).toHaveBeenCalledOnce();
    expect(port.onmessage).toBeNull();
  });

  it('fails the same positive expectation when rendered detections are empty despite a true mock', async () => {
    const port = inferencePort(false);
    const result = await runRenderedVisionJob(
      { plan: plan(), scenario, stage: job, port, cameraPrefix: 'routine-l2:run:' },
      vi.fn(),
    );

    expect(result.passed).toBe(false);
    expect(result.said).toEqual([]);
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('closes its inference connection when a camera fails to render', async () => {
    const port = inferencePort(true);

    stage.render.mockReturnValue({});
    await expect(
      runRenderedVisionJob({ plan: plan(), scenario, stage: job, port, cameraPrefix: 'routine-l2:run:' }, vi.fn()),
    ).rejects.toThrow('could not render');
    expect(port.close).toHaveBeenCalledOnce();
  });
});
