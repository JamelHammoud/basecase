import type { Viewport3DHandle } from '../components/Viewport3D';
import { planActuator, planRatio, type ActuatorPlan } from '../actuators/planActuator';
import type { ActuatorLoads } from '../actuators/pick';
import { PART_NAMES } from '../actuators/actuatorParts';
import { COMPONENT_BY_ID } from '../data/components';
import type { PrinterSetup } from '../data/printers';
import { bedOf } from '../print/bed';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { actuatorLoads } from '../utils/engineeringTorqueRows';
import { torque } from '../utils/torque';
import { runEngineeringNow } from './engineeringNow';
import { newId } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface ActuatorTarget {
  joint: string;
  loads?: ActuatorLoads;
}

export interface ActuatorScene {
  parts: () => ScenePart[];
  project: () => ProjectSettings;
  printer: () => PrinterSetup;
  viewport: () => Viewport3DHandle | null;
  replaceParts: (parts: ScenePart[], joints: RobotJoint[]) => void;
}

async function measuredLoads(scene: ActuatorScene, joint: string): Promise<ActuatorLoads | null> {
  const report = await runEngineeringNow({
    viewport: scene.viewport(),
    parts: scene.parts(),
    project: scene.project(),
    withSweep: false,
  });
  const load = report.joints.find((l) => l.joint.id === joint);

  return load ? actuatorLoads(load) : null;
}

export async function makeActuatorIn(scene: ActuatorScene, target: ActuatorTarget): Promise<ActuatorPlan | string> {
  const loads = target.loads ?? (await measuredLoads(scene, target.joint));

  if (!loads) return `Checks measure no load on ${target.joint}, so there’s nothing to size an actuator to.`;

  const plan = planActuator({
    parts: scene.parts(),
    joints: scene.project().joints ?? [],
    joint: target.joint,
    loads,
    bed: bedOf(scene.printer().model),
    base: newId('actuator'),
  });

  if (typeof plan !== 'string') scene.replaceParts(plan.edit.parts, plan.edit.joints);

  return plan;
}

export const coreActuatorScene = (core: WorkspaceCore): ActuatorScene => ({
  parts: () => core.docs.partsRef.current,
  project: () => core.docs.projectRef.current,
  printer: () => core.printer,
  viewport: () => core.viewportRef.current,
  replaceParts: (parts, joints) => {
    core.docs.commitParts(() => parts);
    core.docs.updateProjectNow((p) => ({ ...p, joints }));
  },
});

export async function makeActuator(core: WorkspaceCore, target: ActuatorTarget) {
  const plan = await makeActuatorIn(coreActuatorScene(core), target);

  if (typeof plan === 'string') return core.showToast(plan);

  core.setSelectedIds([plan.edit.motor]);
}

export function madeText(plan: ActuatorPlan): string {
  const motor = COMPONENT_BY_ID[plan.design.motor]?.name ?? plan.design.motor;
  const printed = Object.values(PART_NAMES).join(', ');

  return (
    `Made ${plan.name}: a ${planRatio(plan)} cycloidal reducer on the ${motor} in place of ${plan.joint.actuators?.[0]}, ` +
    `${torque(plan.spec.stallNm)} stall and ${torque(plan.spec.ratedNm!)} rated (estimates at 0.9 efficiency), ` +
    `reflected armature ${plan.spec.armature!.toFixed(4)} kg·m². Its motor part is ${plan.edit.motor}; ` +
    `the printed parts (${printed}) compile in the background. Checks re-run on their own.`
  );
}

export async function makeActuatorRequest(payload: Record<string, unknown>, scene: ActuatorScene) {
  if (typeof payload.joint !== 'string') return { text: 'Name the joint: make_actuator({ joint }).' };

  const plan = await makeActuatorIn(scene, { joint: payload.joint });

  return { text: typeof plan === 'string' ? plan : madeText(plan) };
}
