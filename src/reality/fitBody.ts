import type { MainModule } from '@mujoco/mujoco';
import type { RobotRun } from '../robot/runBuffer';
import type { SimModel } from '../sim/mjcfTypes';
import { replayBody, type BodyReplayInput, type BodyReplayBudget } from './bodyReplay';
import type { BodyCalibration } from './bodyTypes';
import { bodyErrorUnits, bodyRunWindow, excitedBodyJoints, bodyTrajectoryKey } from './bodyRun';
import { bodyKey } from './bodyLayout';
import { prepareBodyResiduals } from './bodyResiduals';
import { loadedMujoco } from './calibrate';
import { BODY_RUNG } from './ladder';
import { levenbergMarquardt } from './leastSquares';
import { median } from './verdict';
import { canonicalJson } from '../skills/hash';
import { bodyParameters, emptyBodyFit, unpackBodyParameters, type BodyParameter } from './bodyParameters';

export interface BodyFitRequest {
  validation?: RobotRun;
  training?: RobotRun[];
  budget?: BodyReplayBudget;
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

function believable(runs: RobotRun[], fittedError: number, joints: number[]): boolean {
  const spreads = joints.map((j) => {
    const deviations = runs.flatMap((run) => {
      const positions = run.statuses.slice(Math.floor(run.statuses.length / 2)).map((status) => status.positions[j]!);
      const center = median(positions);

      return positions.map((position) => Math.abs(position - center));
    });

    return median(deviations);
  });

  return fittedError < median(spreads) * 0.35;
}

function fitRun(
  ctx: BodyReplayInput & { training: RobotRun[] },
  params: BodyParameter[],
  residual: (predicted: number[][][]) => Float64Array,
) {
  const cache = new Map<string, number[][][]>();
  const predict = (values: number[]) => {
    const key = values.join(',');
    const saved = cache.get(key);

    if (saved) return saved;

    const result = ctx.training.map((run) => replayBody({ ...ctx, run }, unpackBodyParameters(params, values)));

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

  const training = (request.training ?? [request.run]).map(bodyRunWindow);
  const joints = [...new Set(training.flatMap((run) => excitedBodyJoints(request.model, request.robot, run)))];

  if (!joints.length) return result;

  const units = bodyErrorUnits(request.model, request.run, joints);
  const residuals = training.map((run) => prepareBodyResiduals(run, joints));
  const ctx = { ...request, training, mj: request.mj ?? (await loadedMujoco()) };
  const validation = asked.validation ? { ...ctx, run: bodyRunWindow(asked.validation) } : ctx;
  const check = asked.validation ? prepareBodyResiduals(validation.run, joints).check : residuals[0].check;
  const presetErrorRad = error(check(replayBody(validation, emptyBodyFit())));

  if (presetErrorRad < 1e-6) return { ...result, evidence: { ...result.evidence, presetErrorRad, units } };

  const fitted = fitRun(ctx, bodyParameters(request.model, request.robot), (predicted) =>
    Float64Array.from(residuals.flatMap((residual, index) => Array.from(residual.fit(predicted[index])))),
  );
  const fittedErrorRad = error(check(asked.validation ? replayBody(validation, fitted.fit) : fitted.predicted[0]));
  const gain = 1 - fittedErrorRad / presetErrorRad;
  const kept = Number.isFinite(gain) && gain >= BODY_RUNG.passGain && believable(training, fittedErrorRad, joints);

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
    bodyTrajectoryKey(request.run) !== bodyTrajectoryKey(validation)
  );
}

function supportedFitRequest(request: BodyFitRequest): boolean {
  const training = request.training ?? [request.run];

  return (
    usable(request) &&
    request.run.observations !== 'servo-independent-1' &&
    training.length > 0 &&
    training.length <= 5 &&
    (training.length === 1 || !!request.validation) &&
    canonicalJson(bodyRunWindow(training[0])) === canonicalJson(request.run) &&
    training.every(
      (run) =>
        usable({ ...request, run }) &&
        run.joints.join('\0') === request.run.joints.join('\0') &&
        run.observations !== 'servo-independent-1' &&
        (!request.validation || independentValidation({ ...request, run }, request.validation)),
    )
  );
}
