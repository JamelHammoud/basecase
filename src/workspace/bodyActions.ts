import { bodyClient, type BodyFitRequest } from '../reality/bodyClient';
import type { BodyCalibration, BodyErrorUnits } from '../reality/bodyTypes';
import { recordBodyCalibration, rollBackBody } from '../reality/history';
import { unitHistories } from '../reality/projectCalibrations';
import { robotSceneJoints, selectedUnit } from '../robot/robotStore';
import type { RobotRun } from '../robot/runBuffer';
import type { ProjectSettings } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { errorMessage } from '../utils/errorMessage';
import type { WorkspaceCore } from './useWorkspaceCore';

type UpdateProject = (patch: (project: ProjectSettings) => ProjectSettings) => void;

const EMPTY_BODY = { versions: [], active: null };
let seededRun: RobotRun | null = null;
const pending = new Set<string>();
const listeners = new Set<() => void>();

export const setBodyRun = (run: RobotRun | null) => {
  seededRun = run;
};
export const bodyFitPending = (robot: string) => pending.has(robot);
export const subscribeBodyFit = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

function fitting(robot: string, value: boolean) {
  if (value) pending.add(robot);
  else pending.delete(robot);

  listeners.forEach((listener) => listener());
}

function positionError(value: number, units: BodyErrorUnits | undefined): string {
  if (!Number.isFinite(value)) return 'unknown';

  return units === 'm' ? `${(value * 1000).toFixed(2)} mm` : `${((value * 180) / Math.PI).toFixed(2)}°`;
}

export function bodyEvidenceText(calibration: BodyCalibration): string {
  const { presetErrorRad, fittedErrorRad, gain, units } = calibration.evidence;

  if (calibration.verdict === 'cant-tell' && !(presetErrorRad > 0 && Number.isFinite(fittedErrorRad)))
    return 'Can’t tell.';

  const evidence =
    units === 'mixed'
      ? `Replay improvement: ${(gain * 100).toFixed(1)}%.`
      : `${positionError(presetErrorRad, units)} with the preset, ${positionError(fittedErrorRad, units)} with the fit.`;

  return calibration.verdict === 'measured' ? evidence : `Can’t tell. ${evidence}`;
}

export async function fitRecordedBody(
  input: BodyFitRequest & {
    fit: (request: BodyFitRequest) => Promise<BodyCalibration>;
    updateProject: UpdateProject;
  },
) {
  const { model, run, robot, fit, updateProject } = input;
  const result = await fit({ model, run, robot });

  updateProject((project) => ({
    ...project,
    bodyCalibrations: {
      ...project.bodyCalibrations,
      [robot]: recordBodyCalibration(project.bodyCalibrations?.[robot] ?? EMPTY_BODY, result),
    },
  }));

  return bodyEvidenceText(result);
}

export function rollBackBodyCalibration(updateProject: UpdateProject, robot: string) {
  updateProject((project) => ({
    ...project,
    bodyCalibrations: {
      ...project.bodyCalibrations,
      [robot]: rollBackBody(project.bodyCalibrations?.[robot] ?? EMPTY_BODY),
    },
  }));
}

export function bodyRobot(core: WorkspaceCore, wanted?: string): string | null {
  const robots = core.posing.rig.robots;

  if (wanted) return robots.find((robot) => robot.key === wanted || robot.name === wanted)?.key ?? null;

  const joints = robotSceneJoints();
  const matched = robots.filter((robot) => joints?.some((id) => core.posing.rig.robotOf.get(id) === robot.key));

  return matched[0]?.key ?? (robots.length === 1 ? robots[0].key : null);
}

async function fitBodyAttempt(core: WorkspaceCore, wanted?: string) {
  const robot = bodyRobot(core, wanted);

  if (!robot) return { text: 'Choose a robot with joints before fitting its body.', recorded: false };

  if (bodyFitPending(robot)) return { text: 'Body fitting is running.', recorded: false };

  const unit = selectedUnit();
  const worker = bodyClient();

  fitting(robot, true);

  try {
    const given = seededRun;

    seededRun = null;

    const run = given ?? (await platformBridge.robotReadRun(unit));

    if (!run) return { text: 'Record a robot run in Operate before fitting its body.', recorded: false };

    const snapshot = () =>
      JSON.stringify({
        parts: core.docs.partsRef.current,
        joints: core.docs.projectRef.current.joints,
        servos: unitHistories(core.docs.projectRef.current, unit),
        body: core.docs.projectRef.current.bodyCalibrations?.[robot],
      });
    const before = snapshot();
    const buildModel = () =>
      core.simTraining.sim.buildModel({
        withoutBody: true,
        calibrations: unitHistories(core.docs.projectRef.current, unit),
      });
    const model = await buildModel();
    const fingerprint = model.robots.find((r) => r.key === robot)?.fingerprint;
    const fit = async (request: BodyFitRequest) => {
      const result = await worker.fit(request);
      const current = await buildModel();

      if (snapshot() !== before || current.robots.find((r) => r.key === robot)?.fingerprint !== fingerprint)
        throw new Error('The robot changed during fitting. Fit its body again.');

      return result;
    };

    const text = await fitRecordedBody({ model, run, robot, fit, updateProject: core.docs.updateProjectNow });

    return { text, recorded: true };
  } finally {
    worker.dispose();
    fitting(robot, false);
  }
}

export async function fitBodyFor(core: WorkspaceCore, wanted?: string): Promise<string> {
  return (await fitBodyAttempt(core, wanted)).text;
}

export function fitBodyFromUi(core: WorkspaceCore) {
  return fitBodyAttempt(core).then(
    ({ text, recorded }) => {
      if (!recorded || !core.operateVisible()) core.showToast(text);
    },
    (error: unknown) => core.showToast(errorMessage(error)),
  );
}
