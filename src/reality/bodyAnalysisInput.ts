import { datasetContentHash } from '../datasets/contentHash';
import type { RobotRun } from '../robot/runBuffer';
import { SIM_MODEL_VERSION } from '../sim/mjcfTypes';
import {
  BODY_ANALYSIS_LIMITS as LIMITS,
  type BodyAnalysisRefusal,
  type BodyAnalysisRequest,
} from './bodyAnalysisTypes';
import { bodyRunWindow } from './bodyRun';
import { applyBodyFit } from './bodyModel';
import { emptyBodyFit } from './bodyParameters';
import { bodyParameters, type BodyParameter } from './bodyParameters';

function validSamples(run: RobotRun): boolean {
  const validStatus = run.statuses.every(
    (status, index) =>
      Number.isFinite(status.at) &&
      status.at >= 0 &&
      (index === 0 || status.at > run.statuses[index - 1].at) &&
      status.positions.length === run.joints.length &&
      status.positions.every((value) => value !== null && Number.isFinite(value)),
  );
  const validIntent = run.intents.every(
    (intent, index) =>
      Number.isFinite(intent.at) &&
      intent.at >= 0 &&
      (index === 0 || intent.at >= run.intents[index - 1].at) &&
      intent.joints.length === run.joints.length &&
      intent.joints.every(Number.isFinite),
  );

  return validStatus && validIntent;
}

function recordingProblem({ model, run, robot, units }: BodyAnalysisRequest): BodyAnalysisRefusal | null {
  const target = model.robots.find((candidate) => candidate.key === robot);
  const mapped = run.joints.map((id) => model.joints.find((joint) => joint.id === id && joint.robot === robot));
  const validMapping =
    !!target &&
    new Set(run.joints).size === run.joints.length &&
    target.joints.length === run.joints.length &&
    target.joints.every((id) => run.joints.includes(id)) &&
    mapped.every(Boolean);

  if (!validMapping || model.version !== SIM_MODEL_VERSION || mapped.some((joint) => joint?.drive !== 'position'))
    return 'unsupported';

  if (
    units.length !== mapped.length ||
    mapped.some((joint, index) => units[index] !== (joint?.type === 'revolute' ? 'rad' : 'm'))
  )
    return 'units';

  return timingProblem(bodyRunWindow(run), run);
}

function timingProblem(run: RobotRun, complete: RobotRun): BodyAnalysisRefusal | null {
  if (run.statuses.length < 20 || run.intents.length < 2 || !validSamples(complete)) return 'recording';

  const from = run.statuses[0].at;
  const to = run.statuses.at(-1)!.at;

  return to - from >= 1000 && run.intents[0].at <= from ? null : 'recording';
}

function withinBudget(request: BodyAnalysisRequest, parameters: BodyParameter[]): boolean {
  const { run, model } = request;
  const dt = Number(/\btimestep="([^"]+)"/.exec(model.xml)?.[1] ?? 0.002);
  const duration = run.statuses.at(-1)!.at - run.statuses[0].at;
  const steps = Math.ceil(duration / (dt * 1000)) * (1 + 2 * parameters.length);

  return (
    parameters.length > 0 &&
    parameters.length <= LIMITS.parameters &&
    run.joints.length <= LIMITS.joints &&
    model.joints.length <= LIMITS.joints &&
    model.bodies.length <= 128 &&
    run.statuses.length <= LIMITS.inputSamples &&
    run.intents.length <= LIMITS.intents &&
    duration <= LIMITS.durationMs &&
    new TextEncoder().encode(model.xml).length <= LIMITS.xmlBytes &&
    Number.isFinite(steps) &&
    dt >= 0.00001 &&
    steps <= LIMITS.stepBudget
  );
}

function supportedNominal(request: BodyAnalysisRequest): boolean {
  const fit = request.nominal ?? emptyBodyFit();
  const parameters = bodyParameters(request.model, request.robot);
  const supported = (kind: 'massScales' | 'payloadKg') =>
    Object.entries(fit[kind]).every(([name, value]) => {
      const parameter = parameters.find((candidate) => candidate.kind === kind && candidate.name === name);
      const lower = kind === 'payloadKg' ? 0 : 0.25;
      const upper = kind === 'payloadKg' ? 2 : 4;

      return !!parameter && Number.isFinite(value) && value >= lower && value <= upper;
    });
  const floor = fit.floorFrictionScale;
  const floating = parameters.some((parameter) => parameter.kind === 'floorFrictionScale');

  return (
    supported('massScales') &&
    supported('payloadKg') &&
    Number.isFinite(floor) &&
    (floating ? floor >= 0.1 && floor <= 4 : floor === 1)
  );
}

export async function bodyAnalysisProblem(request: BodyAnalysisRequest): Promise<BodyAnalysisRefusal | null> {
  const { source, model, robot } = request;

  if (!source) return 'provenance';

  if (!supportedNominal(request)) return 'unsupported';

  if (
    model.xml.length > LIMITS.xmlBytes ||
    request.run.statuses.length > LIMITS.inputSamples ||
    request.run.intents.length > LIMITS.intents
  )
    return 'budget';

  const effective = applyBodyFit(model, robot, request.nominal ?? emptyBodyFit());
  const fingerprint = effective.robots.find((candidate) => candidate.key === robot)?.fingerprint;
  const provenance =
    [
      source.recording,
      source.unit,
      source.scene,
      source.modelHash,
      source.modelFingerprint,
      source.calibrationFingerprint,
    ].every((value) => typeof value === 'string' && value.length > 0 && value.length <= 256) &&
    /^[a-f0-9]{64}$/.test(source.modelHash) &&
    source.modelFingerprint === fingerprint;

  if (!provenance || (await datasetContentHash(new TextEncoder().encode(effective.xml))) !== source.modelHash)
    return 'provenance';

  const problem = recordingProblem(request);

  if (problem) return problem;

  return withinBudget({ ...request, run: bodyRunWindow(request.run) }, bodyParameters(model, robot)) ? null : 'budget';
}
