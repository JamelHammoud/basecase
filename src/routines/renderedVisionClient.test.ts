import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraStageJob } from '../cameras/cameraStage';
import type { Plan } from './planTypes';
import type { Scenario, ScenarioResult } from './scenarioTypes';
import { runRenderedVisionScenario } from './renderedVisionClient';

const session = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock('../cameras/visionSession', () => ({ connectVisionFrames: session.connect }));

class TestWorker {
  static readonly instances: TestWorker[] = [];

  static get instance() {
    return TestWorker.instances.at(-1)!;
  }
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    TestWorker.instances.push(this);
  }
}

const plan = {} as Plan;
const scenario = { tier: 'L2' } as Scenario;
const stage = { parts: [], world: [], views: [], model: null } as CameraStageJob;
const result = {
  passed: true,
  trace: [],
  said: [],
  failures: [],
  maxControlGapMs: 20,
  controlTicks: 51,
} as ScenarioResult;
let port: MessagePort;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Worker', TestWorker);
  port = { close: vi.fn() } as unknown as MessagePort;
  session.connect.mockResolvedValue(port);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('rendered L2 main-thread client', () => {
  it('transfers only geometry and the shared vision port and terminates after the result', async () => {
    const pending = runRenderedVisionScenario(plan, scenario, stage);

    await Promise.resolve();

    const worker = TestWorker.instance;

    expect(session.connect).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(
      { plan, scenario, stage, port, cameraPrefix: expect.stringMatching(/^routine-l2:/) },
      [port],
    );
    worker.onmessage?.({ data: { type: 'result', result } } as MessageEvent);
    await expect(pending).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });

  it('rejects a silent camera worker and clears its only timer', async () => {
    vi.useFakeTimers();

    const pending = runRenderedVisionScenario(plan, scenario, stage);
    const rejected = expect(pending).rejects.toThrow('timed out');

    await vi.advanceTimersByTimeAsync(45000);
    await rejected;
    expect(TestWorker.instance.terminate).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases both resources on a renderer crash without running a main-thread fallback', async () => {
    const pending = runRenderedVisionScenario(plan, scenario, stage);

    await Promise.resolve();
    TestWorker.instance.onerror?.({ message: 'WebGL unavailable' } as ErrorEvent);
    await expect(pending).rejects.toThrow('WebGL unavailable');
    expect(TestWorker.instance.terminate).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
  });
});
