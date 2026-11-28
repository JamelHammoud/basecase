import type { MainModule } from '@mujoco/mujoco';
import type { BodyAnalysisRequest, BodyAnalysisResult } from './bodyAnalysisTypes';
import { changedFit } from './bodyAnalysisParameters';
import { applyBodyFit } from './bodyModel';
import { emptyBodyFit } from './bodyParameters';
import { replayBodies, type BodyReplayBudget } from './bodyReplay';
import { normalizedBodyResponse } from './bodySensitivity';
import type { BodyMotionPlan } from './bodyMotionTypes';

export function bodyMotionResponses(input: {
  input: { request: BodyAnalysisRequest; result: Pick<BodyAnalysisResult, 'parameters' | 'method'> };
  plans: BodyMotionPlan[];
  mj: MainModule;
  budget: BodyReplayBudget;
}) {
  const { request, result } = input.input;
  const replayInput = {
    ...request,
    runs: input.plans.map((plan) => plan.run),
    model: { ...request.model, scans: undefined },
    mj: input.mj,
    budget: input.budget,
  };
  const normalized = (positions: number[][]) =>
    Float64Array.from(
      positions.flatMap((row) =>
        row.map(
          (value, index) => value / (request.units[index] === 'rad' ? result.method.noiseRad : result.method.noiseM),
        ),
      ),
    );
  const columns = input.plans.map(() => [] as Float64Array[]);
  const identity = emptyBodyFit();
  const nominal = applyBodyFit(replayInput.model, request.robot, request.nominal ?? identity);
  let nominalResponses: Float64Array[] | undefined;
  const probe = (parameter: (typeof result.parameters)[number], value: number) => {
    const model = applyBodyFit(replayInput.model, request.robot, changedFit({ request, parameter, value }));

    if (model.xml === nominal.xml) {
      nominalResponses ??= replayBodies({ ...replayInput, model }, identity).map(normalized);

      return nominalResponses;
    }

    return replayBodies({ ...replayInput, model }, identity).map(normalized);
  };

  for (const parameter of result.parameters) {
    const low = probe(parameter, parameter.probe[0]);
    const high = probe(parameter, parameter.probe[1]);

    input.plans.forEach((_, index) =>
      columns[index].push(
        normalizedBodyResponse({
          low: low[index],
          high: high[index],
          span: parameter.probe[1] - parameter.probe[0],
          scale: parameter.scale,
        }),
      ),
    );
  }

  return { columns };
}
