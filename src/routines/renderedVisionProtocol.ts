import type { CameraStageJob } from '../cameras/cameraStage';
import type { Plan } from './planTypes';
import type { Scenario, ScenarioResult } from './scenarioTypes';

export interface RenderedVisionRequest {
  plan: Plan;
  scenario: Scenario;
  stage: CameraStageJob;
  port: MessagePort;
  cameraPrefix: string;
}

export type RenderedVisionResponse =
  { type: 'progress' } | { type: 'result'; result: ScenarioResult } | { type: 'error'; error: string };
