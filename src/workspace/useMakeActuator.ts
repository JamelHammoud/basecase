import { buildActuator } from '../actuator/actuatorBuild';
import { actuatorFor, choiceOf, type ActuatorFix } from '../actuator/actuatorFix';
import type { ActuatorChoice } from '../actuator/pickActuator';
import { bedOf } from '../print/bed';
import type { ScenePart } from '../types/robotics';
import { jointLabel } from '../utils/engineeringFormat';
import { servoParts, servoSupplyVolts } from '../utils/engineeringPower';
import { selectionJoint } from '../utils/posingHelpers';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { runEngineeringNow } from './engineeringNow';
import { freshWalk } from './storedWalk';
import type { WorkspaceCore } from './useWorkspaceCore';

export type MadeActuator = { added: ScenePart[]; name: string } | { problem: string };

function selectedHinge(core: WorkspaceCore): string | null {
  const id = selectionJoint(core.posing.rig, core.selectedIds, 'pose');

  return id && core.project.joints?.some((j) => j.id === id && j.type === 'revolute') ? id : null;
}

export function useMakeActuator(core: WorkspaceCore) {
  'use memo';

  const { docs, viewportRef, printer, setSelectedIds, showToast } = core;

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
    const joint = docs.projectRef.current.joints?.find((j) => j.id === jointId);

    if (!joint) return { problem: `No joint ${jointId}` };

    if (joint.type !== 'revolute') return { problem: `${jointLabel(joint)} isn’t a hinge` };

    const choice = fix ? choiceOf(fix) : await choose(jointId);

    if (!choice || typeof choice === 'string') return { problem: choice ?? `No actuator for ${jointLabel(joint)}` };

    const built = buildActuator(
      { parts: docs.partsRef.current, joints: docs.projectRef.current.joints ?? [] },
      jointId,
      choice,
    );

    if (!built) return { problem: `No actuator for ${jointLabel(joint)}` };

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
    jointId: IS_WEB_DEMO ? null : selectedHinge(core),
    make,
    run: (jointId: string, fix?: ActuatorFix) => void run(jointId, fix),
  };
}

export type MakeActuator = ReturnType<typeof useMakeActuator>;
