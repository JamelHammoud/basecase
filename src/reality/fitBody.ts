import type { MainModule } from '@mujoco/mujoco';
import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';
import { replayBody, type BodyReplayInput } from './bodyReplay';
import type { BodyCalibration } from './bodyTypes';
import { bodyErrorUnits, bodyRunWindow, excitedBodyJoints } from './bodyRun';
import { bodyKey } from './bodyLayout';
import { prepareBodyResiduals, type BodyResidual } from './bodyResiduals';
import { loadedMujoco } from './calibrate';
import { BODY_RUNG } from './ladder';
import { levenbergMarquardt } from './leastSquares';
import { median } from './verdict';
import { bodyParameters, emptyBodyFit, unpackBodyParameters, type BodyParameter } from './bodyParameters';

export interface BodyFitRequest {
  validation?: RobotRun;
  model: SimModel;
  run: RobotRun;
  robot: string;
  mj?: MainModule;
}

function usable({ model, robot, run }: BodyFitRequest): boolean {
  const target = model.robots.find((r) => r.key === robot);
  const ids = new Set(run.joints);
  const statusesValid = run.statuses.every(
    (s, i) =>
      Number.isFinite(s.at) &&
      (i === 0 || s.at > run.statuses[i - 1].at) &&
      s.positions.length === run.joints.length &&
      s.positions.every((v) => v !== null && Number.isFinite(v)),
  );
  const intentsValid = run.intents.every(
    (s, i) =>
      Number.isFinite(s.at) &&
      (i === 0 || s.at >= run.intents[i - 1].at) &&
      s.joints.length === run.joints.length &&
      s.joints.every(Number.isFinite),
  );

  return (
    !!target &&
    target.joints.every((id) => ids.has(id)) &&
    ids.size === run.joints.length &&
    run.joints.every((id) => model.joints.some((j) => j.id === id)) &&
    run.statuses.length >= 20 &&
    statusesValid &&
    run.intents.length >= 2 &&
    intentsValid &&
    run.intents[0].at <= run.statuses[0].at &&
    run.statuses.at(-1)!.at - run.statuses[0].at >= 1000
  );
}

const error = (r: Float64Array) => median(Array.from(r, Math.abs));

function believable(run: RobotRun, fittedError: number, joints: number[]): boolean {
  const spreads = joints.map((j) => {
    const positions = run.statuses.slice(Math.floor(run.statuses.length / 2)).map((s) => s.positions[j]!);
    const center = median(positions);

    return median(positions.map((p) => Math.abs(p - center)));
  });

  return fittedError < median(spreads) * 0.35;
}

function fitRun(ctx: BodyReplayInput, params: BodyParameter[], residual: BodyResidual) {
  const cache = new Map<string, number[][]>();
  const predict = (values: number[]) => {
    const key = values.join(',');
    const saved = cache.get(key);

    if (saved) return saved;

    const result = replayBody(ctx, unpackBodyParameters(params, values));

    cache.set(key, result);

    return result;
  };
  const x0 = frictionStart(params, (values) => residual(predict(values)));
  const solved = levenbergMarquardt({
    x0,
    lower: params.map((p) => p.lower),
    upper: params.map((p) => p.upper),
    step: 0.01,
    maxIterations: 16,
    residual: (values) => residual(predict(values)),
  });

  return { fit: unpackBodyParameters(params, solved.x), predicted: predict(solved.x) };
}

function frictionStart(params: BodyParameter[], residual: (values: number[]) => Float64Array): number[] {
  const index = params.findIndex((p) => p.kind === 'floorFrictionScale');
  const initial = params.map(() => 0);

  if (index < 0) return initial;

  const candidates = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2].map((scale) => {
    const values = [...initial];

    values[index] = Math.log(scale);

    return { values, cost: residual(values).reduce((sum, value) => sum + value * value, 0) };
  });

  return candidates.reduce((best, candidate) => (candidate.cost < best.cost ? candidate : best)).values;
}

export async function fitBody(asked: BodyFitRequest): Promise<BodyCalibration> {
  const request = { ...asked, run: bodyRunWindow(asked.run) };
  const result: BodyCalibration = {
    version: 0,
    verdict: 'cant-tell',
    robot: request.robot,
    fit: emptyBodyFit(),
    evidence: { presetErrorRad: 0, fittedErrorRad: 0, gain: 0 },
    modelFingerprint: request.model.robots.find((r) => r.key === request.robot)?.fingerprint ?? '',
    bodyKeys: Object.fromEntries(
      request.model.bodies.filter((body) => body.robot === request.robot).map((body) => [body.name, bodyKey(body)]),
    ),
  };

  if (!supportedFitRequest(request)) return result;

  const joints = excitedBodyJoints(request.model, request.robot, request.run);

  if (!joints.length) return result;

  const units = bodyErrorUnits(request.model, request.run, joints);
  const residuals = prepareBodyResiduals(request.run, joints);
  const ctx = { ...request, mj: request.mj ?? (await loadedMujoco()) };
  const validation = asked.validation ? { ...ctx, run: bodyRunWindow(asked.validation) } : ctx;
  const check = asked.validation ? prepareBodyResiduals(validation.run, joints).check : residuals.check;
  const presetErrorRad = error(check(replayBody(validation, emptyBodyFit())));

  if (presetErrorRad < 1e-6) return { ...result, evidence: { ...result.evidence, presetErrorRad, units } };

  const fitted = fitRun(ctx, bodyParameters(request.model, request.robot), residuals.fit);
  const fittedErrorRad = error(check(asked.validation ? replayBody(validation, fitted.fit) : fitted.predicted));
  const gain = 1 - fittedErrorRad / presetErrorRad;
  const kept = Number.isFinite(gain) && gain >= BODY_RUNG.passGain && believable(request.run, fittedErrorRad, joints);

  return {
    ...result,
    verdict: kept ? 'measured' : 'cant-tell',
    fit: kept ? fitted.fit : emptyBodyFit(),
    evidence: { presetErrorRad, fittedErrorRad, gain, units },
  };
}

function independentValidation(request: BodyFitRequest, validation: RobotRun): boolean {
  return (
    validation.observations !== 'servo-independent-1' &&
    usable({ ...request, run: bodyRunWindow(validation), validation: undefined }) &&
    request.run.joints.join('\0') === validation.joints.join('\0') &&
    JSON.stringify(request.run.intents) !== JSON.stringify(validation.intents)
  );
}

function supportedFitRequest(request: BodyFitRequest): boolean {
  return (
    usable(request) &&
    request.run.observations !== 'servo-independent-1' &&
    (!request.validation || independentValidation(request, request.validation))
  );
}
