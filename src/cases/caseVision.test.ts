import { describe, expect, it, vi } from 'vitest';
import type { SimEngine } from '../sim/engine';
import type { VisionResult } from '../vision/types';
import { CaseLogicRun, compileCaseLogic } from './caseLogic';
import { gameLogic } from './fixtureGames';

const cup: VisionResult = {
  modelId: 'rfdetr-nano',
  camera: 'front',
  timestamp: 100,
  width: 640,
  height: 480,
  detections: [{ label: 'cup', score: 0.9, box: [0.2, 0.2, 0.2, 0.4] }],
};

describe('Case camera conditions', () => {
  it('takes a fresh detector result through the real coordinator without inventing a camera fact', async () => {
    const logic = gameLogic(3);

    logic.requires.push('camera', 'speaker');
    logic.watchers = [
      { id: 'cup', model: 'object-detection', label: 'cup', rateHz: 10, maxAgeMs: 300, publishes: { type: 'boolean' } },
    ];
    logic.reactions = [
      {
        id: 'greet',
        when: { fact: 'cup', is: true },
        cooldownMs: 0,
        onRetrigger: 'ignore',
        body: 'keepGoing',
        steps: [{ kind: 'say', text: 'Hello', timeoutMs: 1000, onTimeout: [], onFail: [] }],
      },
    ];

    const compiled = compileCaseLogic(logic, { skills: [] });
    const controller = vi.fn();
    const engine = { setController: controller } as unknown as SimEngine;

    expect(compiled.ok).toBe(true);

    const run = await CaseLogicRun.start({
      plan: compiled.plan!,
      seconds: 3,
      engine,
      handBack: () => undefined,
      body: null,
    });

    run.advance(500, {});
    expect(run.result().said).toEqual([]);
    run.acceptVision(cup, 1000);
    run.advance(600, {});
    expect(run.result().said).toEqual([]);
    run.acceptVision({ ...cup, timestamp: 200 }, 0);
    run.advance(700, {});
    expect(run.result().said).toEqual(['Hello']);
    expect(run.result().facts.cup).toBe(true);
    expect(run.result().facts['vision.front.cup']).toBe(1);
    run.acceptVision({ ...cup, modelId: 'yolo11n', timestamp: 300, detections: [] }, 0);
    expect(run.result().facts['vision.front.cup']).toBe(1);
    run.advance(1100, {});
    expect(run.result().facts.cup).toBeUndefined();
    expect(controller).not.toHaveBeenCalled();
  });
});
