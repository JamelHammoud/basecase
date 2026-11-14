import type { VisionEngine } from '../vision/engine';
import type { RgbaFrame } from '../vision/protocol';
import type { Plan } from './planTypes';
import { RoutineVision } from './routineVision';
import { planVisionSources } from './visionSources';
import { liveModelErrors } from './liveModels';
import { scenarioResult, startScenario } from './scenario';
import type { Scenario, ScenarioResult } from './scenarioTypes';

export interface VisionScenarioInput {
  engine: VisionEngine;
  renderFrame: (atMs: number, camera: string) => RgbaFrame | Promise<RgbaFrame>;
  camera?: string;
}

export async function runVisionScenario(
  plan: Plan,
  scenario: Scenario,
  input: VisionScenarioInput,
): Promise<ScenarioResult> {
  const rig = await startScenario(plan, scenario);
  const vision = new RoutineVision();
  const sources = planVisionSources(plan, input.camera);
  const errors = liveModelErrors(plan);

  if (errors.length) throw new Error(errors[0].message);

  const seconds = scenario.seconds * 1000;

  rig.host.perception = vision;

  for (let t = 0; t <= seconds; t += 20) {
    const frames = new Map<string, RgbaFrame>();

    for (const source of sources) {
      const frame = frames.get(source.camera) ?? (await input.renderFrame(t, source.camera));

      frames.set(source.camera, frame);
      vision.push(await input.engine.infer(source.model, frame, { camera: source.camera, timestamp: t }));
    }

    rig.clock.runUntil(t);
  }

  return scenarioResult(rig);
}
