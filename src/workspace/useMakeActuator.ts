import { buildActuator } from '../actuator/actuatorBuild';
import { actuatorFor, choiceOf, type ActuatorFix } from '../actuator/actuatorFix';
import type { ActuatorChoice } from '../actuator/pickActuator';
import { bedOf } from '../print/bed';
import type { ScenePart } from '../types/robotics';
import { servoParts, servoSupplyVolts } from '../utils/engineeringPower';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { runEngineeringNow } from './engineeringNow';
import { freshWalk } from './storedWalk';
import type { WorkspaceCore } from './useWorkspaceCore';

export type MadeActuator = { added: ScenePart[]; name: string } | { problem: string };

const takesActuator = (core: WorkspaceCore, id: string | null) =>
  !!id && core.project.joints?.some((j) => j.id === id && j.type === 'revolute');

export function useMakeActuator(core: WorkspaceCore) {
  'use memo';

  const { docs, viewportRef, printer, posing, setSelectedIds, showToast } = core;

  const choose = async (jointId: string): Promise<ActuatorChoice | string> => {
    const parts = docs.partsRef.current;
    const project = docs.projectRef.current;
    const report = await runEngineeringNow({ viewport: viewportRef.current, parts, project, withSweep: false });
    const load = report.joints.find((l) => l.joint.id === jointId);

    if (!load) return `No joint ${jointId}`;

    const volts = servoSupplyVolts({ parts, project, servos: servoParts(parts) });
    const pick = actuatorFor(load, { bed: bedOf(printer.model), walk: freshWalk(parts, project), volts });

    return 'choice' in pick ? pick.choice : pick.problem;
  };

  const make = async (jointId: string, fix?: ActuatorFix): Promise<MadeActuator> => {
    const choice = fix ? choiceOf(fix) : await choose(jointId);

    if (!choice || typeof choice === 'string') return { problem: choice ?? `No actuator for ${jointId}` };

    const built = buildActuator(
      { parts: docs.partsRef.current, joints: docs.projectRef.current.joints ?? [] },
      jointId,
      choice,
    );

    if (!built) return { problem: `${jointId} isn’t a hinge` };

    docs.commitProject(
      { joints: docs.projectRef.current.joints },
      (p) => ({ ...p, joints: built.joints }),
      built.parts,
    );
    setSelectedIds([built.motorId]);

    return { added: built.added, name: built.added[0].group?.name ?? jointId };
  };

  const run = async (jointId: string, fix?: ActuatorFix) => {
    const made = await make(jointId, fix);

    if ('problem' in made) showToast(made.problem);
  };

  return {
    jointId: !IS_WEB_DEMO && takesActuator(core, posing.activeJointId) ? posing.activeJointId : null,
    make,
    run: (jointId: string, fix?: ActuatorFix) => void run(jointId, fix),
  };
}

export type MakeActuator = ReturnType<typeof useMakeActuator>;
