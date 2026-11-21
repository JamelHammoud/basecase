import type { MainModule } from '@mujoco/mujoco';
import { loadedMujoco } from './calibrate';
import { bodyRunWindow } from './bodyRun';
import { bodyAnalysisProblem } from './bodyAnalysisInput';
import {
  BODY_ANALYSIS_METHOD as METHOD,
  BODY_ANALYSIS_LIMITS,
  type BodyAnalysisOutcome,
  type BodyAnalysisParameter,
  type BodyAnalysisRequest,
} from './bodyAnalysisTypes';
import { bodyParameters, emptyBodyFit } from './bodyParameters';
import { replayBody, BodyReplayStopped } from './bodyReplay';
import { bodySensitivity, normalizedBodyResponse } from './bodySensitivity';

interface AnalysisOptions {
  mj?: MainModule;
  cancelled?: () => boolean;
}

function physicalParameters(request: BodyAnalysisRequest): BodyAnalysisParameter[] {
  return bodyParameters(request.model, request.robot).map((parameter) => {
    const body = request.model.bodies.find((candidate) => candidate.name === parameter.name);
    const label =
      request.model.joints.find((joint) => joint.id === body?.joint)?.name ??
      request.model.robots.find((robot) => robot.key === request.robot)!.name;
    const payload = parameter.kind === 'payloadKg';
    const fit = request.nominal ?? emptyBodyFit();
    const nominal =
      parameter.kind === 'floorFrictionScale'
        ? fit.floorFrictionScale
        : (fit[parameter.kind][parameter.name] ?? (payload ? 0 : 1));
    const step = payload ? 0.0001 : 0.001;
    const bounds: [number, number] = payload
      ? [parameter.lower * 0.1, parameter.upper * 0.1]
      : [Math.exp(parameter.lower), Math.exp(parameter.upper)];

    return {
      body: parameter.name,
      label,
      kind: parameter.kind,
      unit: payload ? 'kg' : 'scale',
      nominal,
      bounds,
      probe: [Math.max(bounds[0], nominal - step), Math.min(bounds[1], nominal + step)],
      scale: payload ? 0.1 : 0.25,
      response: 0,
      distinguishability: 'poor-excitation',
    };
  });
}

function changedFit(input: { request: BodyAnalysisRequest; parameter: BodyAnalysisParameter; value: number }) {
  const { request, parameter, value } = input;
  const fit = structuredClone(request.nominal ?? emptyBodyFit());

  if (parameter.kind === 'floorFrictionScale') fit.floorFrictionScale = value;
  else fit[parameter.kind][parameter.body] = value;

  return fit;
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
  const budget = { remainingSteps: BODY_ANALYSIS_LIMITS.stepBudget, cancelled: options.cancelled };
  const refused = (reason: Extract<BodyAnalysisOutcome, { kind: 'refused' }>['reason']): BodyAnalysisOutcome => ({
    kind: 'refused',
    reason,
    replays,
  });

  if (options.cancelled?.()) return refused('cancelled');

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
