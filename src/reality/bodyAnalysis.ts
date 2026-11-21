import type { MainModule } from '@mujoco/mujoco';
import { loadedMujoco } from './calibrate';
import { bodyRunWindow } from './bodyRun';
import { bodyAnalysisProblem } from './bodyAnalysisInput';
import {
  BODY_ANALYSIS_METHOD as METHOD,
  BODY_ANALYSIS_LIMITS,
  type BodyAnalysisOutcome,
  type BodyAnalysisRequest,
} from './bodyAnalysisTypes';
import { emptyBodyFit } from './bodyParameters';
import { physicalParameters, changedFit } from './bodyAnalysisParameters';
import { replayBody, BodyReplayStopped, type BodyReplayBudget } from './bodyReplay';
import { bodySensitivity, normalizedBodyResponse } from './bodySensitivity';

interface AnalysisOptions {
  mj?: MainModule;
  cancelled?: () => boolean;
  budget?: BodyReplayBudget;
}

function analysisBudget(options: AnalysisOptions): BodyReplayBudget {
  return options.budget ?? { remainingSteps: BODY_ANALYSIS_LIMITS.stepBudget, cancelled: options.cancelled };
}

function residual(request: BodyAnalysisRequest, predicted: number[][]): Float64Array {
  const noise = request.units.map((unit) => (unit === 'rad' ? METHOD.noiseRad : METHOD.noiseM));

  return Float64Array.from(
    predicted.flatMap((row, frame) =>
      row.map((value, joint) => (value - request.run.statuses[frame].positions[joint]!) / noise[joint]),
    ),
  );
}

export async function analyzeBody(
  original: BodyAnalysisRequest,
  options: AnalysisOptions = {},
): Promise<BodyAnalysisOutcome> {
  let request = original;
  let replays = 0;
  const budget = analysisBudget(options);
  const refused = (reason: Extract<BodyAnalysisOutcome, { kind: 'refused' }>['reason']): BodyAnalysisOutcome => ({
    kind: 'refused',
    reason,
    replays,
  });

  if (options.cancelled?.()) return refused('cancelled');

  if (!bodyObservationsSupported(request)) return refused('backend');

  const problem = await bodyAnalysisProblem(request).catch(() => 'unsupported' as const);

  if (problem) return refused(problem);

  const window = bodyRunWindow(original.run);
  const statuses = window.statuses;
  const samples = Math.min(statuses.length, BODY_ANALYSIS_LIMITS.samples);

  request = {
    ...original,
    run: {
      ...window,
      statuses: Array.from(
        { length: samples },
        (_, index) => statuses[Math.round((index * (statuses.length - 1)) / (samples - 1))],
      ),
    },
  };

  let mj = options.mj;
  const replay = (fit: ReturnType<typeof emptyBodyFit>) => {
    if (options.cancelled?.()) throw new Error('cancelled');

    replays++;

    return residual(
      request,
      replayBody({ ...request, model: { ...request.model, scans: undefined }, mj: mj!, budget }, fit),
    );
  };

  try {
    mj ??= await loadedMujoco();

    const baseline = replay(request.nominal ?? emptyBodyFit());
    const parameters = physicalParameters(request);
    const columns = parameters.map((parameter) => {
      const low = replay(changedFit({ request, parameter, value: parameter.probe[0] }));
      const high = replay(changedFit({ request, parameter, value: parameter.probe[1] }));

      return normalizedBodyResponse({
        low,
        high,
        span: parameter.probe[1] - parameter.probe[0],
        scale: parameter.scale,
      });
    });
    const sensitivity = bodySensitivity(columns, baseline);
    const rmsNoise = Math.sqrt(baseline.reduce((sum, value) => sum + value * value, 0) / baseline.length);

    if (options.cancelled?.()) return refused('cancelled');

    if (!Number.isFinite(rmsNoise)) return refused('numerical');

    return {
      kind: 'analyzed',
      source: structuredClone(request.source),
      robot: request.robot,
      method: METHOD,
      interval: [request.run.statuses[0].at, request.run.statuses.at(-1)!.at],
      samples: request.run.statuses.length,
      replays,
      parameters: parameters.map((parameter, index) => ({
        ...parameter,
        response: sensitivity.responses[index],
        distinguishability: sensitivity.parameters[index],
      })),
      directions: sensitivity.directions,
      residual: {
        rmsNoise,
        modelExplainsObservations: rmsNoise <= METHOD.absoluteResponse,
        outsideSupportedDirections: sensitivity.outsideSupportedDirections,
        unresolved: rmsNoise > METHOD.absoluteResponse,
      },
    };
  } catch (error) {
    if (error instanceof BodyReplayStopped) return refused(error.reason);

    return refused(options.cancelled?.() ? 'cancelled' : 'numerical');
  }
}

export function bodyObservationsSupported(request: BodyAnalysisRequest): boolean {
  return request.observations !== 'servo-independent-1' && request.run.observations !== 'servo-independent-1';
}
