import type { VisionPixels, VisionResult } from '../vision/types';
import type { Plan } from './planTypes';
import { scenarioResult, startScenario } from './scenario';
import { CONTROL_PERIOD_MS } from './scenarioMocks';
import type { Scenario, ScenarioResult } from './scenarioTypes';
import { routineVisionModels } from './vision';
import { RoutineVisionFacts } from './visionFacts';

export interface VisionScenarioFrames {
  render: (atMs: number) => Promise<ImageBitmap | VisionPixels>;
  infer: (model: string, frame: ImageBitmap | VisionPixels) => Promise<VisionResult>;
}

export type VisionScenarioInput =
  | VisionScenarioFrames
  | {
      sample: (model: string, atMs: number) => Promise<VisionResult[]>;
    };

export async function runVisionScenario(
  plan: Plan,
  scenario: Scenario,
  input: VisionScenarioInput,
): Promise<ScenarioResult> {
  const rig = await startScenario(plan, scenario);
  const vision = new RoutineVisionFacts(plan);
  const models = routineVisionModels(plan);

  rig.host.vision = vision;

  const rate = Math.min(30, Math.max(5, ...plan.watchers.map((watcher) => watcher.rateHz)));
  const period = 1000 / rate;
  let nextFrame = 0;

  for (let at = 0; at <= scenario.seconds * 1000; at += CONTROL_PERIOD_MS) {
    if (at >= nextFrame) {
      await sampleVision({ models, vision, input, at });
      nextFrame += period;
    }

    rig.clock.runUntil(at);
  }

  rig.clock.runUntil(scenario.seconds * 1000);

  return scenarioResult(rig);
}

async function sampleVision(options: {
  models: string[];
  vision: RoutineVisionFacts;
  input: VisionScenarioInput;
  at: number;
}) {
  for (const model of options.models) {
    const results = await sampleModel(options.input, model, options.at);

    for (const result of results) options.vision.accept(result, options.at);
  }
}

async function sampleModel(input: VisionScenarioInput, model: string, at: number): Promise<VisionResult[]> {
  if ('sample' in input) return input.sample(model, at);

  const frame = await input.render(at);

  try {
    return [await input.infer(model, frame)];
  } finally {
    if ('close' in frame) frame.close();
  }
}
