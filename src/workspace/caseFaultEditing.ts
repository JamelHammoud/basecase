import { faultsOf, MAX_CASE_FAULTS, sameFault, withFault, withoutFault, type CaseFault } from '../cases/caseFaults';
import type { Case } from '../cases/schema';
import { confirmAction } from '../design-system/confirmStore';
import { FAULT_LABEL } from '../sim/faults';
import type { ProjectSettings, RobotJoint } from '../types/robotics';
import type { Setter } from './types';

interface FaultOptions {
  active: Case | null;
  joints: RobotJoint[];
  setProject: Setter<ProjectSettings>;
}

export const servoJoints = (joints: RobotJoint[]) =>
  joints.filter((j) => j.type !== 'fixed' && j.actuation !== 'passive');

export const faultName = (joints: RobotJoint[], fault: CaseFault) =>
  `${FAULT_LABEL[fault.kind]} ${joints.find((j) => j.id === fault.joint)?.name ?? fault.joint}`;

export function caseFaultEditing({ active, joints, setProject }: FaultOptions) {
  const faults = active ? faultsOf(active) : [];
  const commit = (edit: (kase: Case) => Case) => {
    if (!active) return;

    const next = edit(active);

    setProject((project) => ({
      ...project,
      cases: (project.cases ?? []).map((kase) => (kase.id === next.id ? next : kase)),
    }));
  };

  return {
    faults,
    joints: servoJoints(joints),
    canAdd: !!active && faults.length < MAX_CASE_FAULTS,
    has: (fault: CaseFault) => faults.some((f) => sameFault(f, fault)),
    name: (fault: CaseFault) => faultName(joints, fault),
    add: (fault: CaseFault) => commit((kase) => withFault(kase, fault)),
    remove: (fault: CaseFault) =>
      confirmAction({
        title: `Delete ${faultName(joints, fault)}?`,
        onConfirm: () => commit((kase) => withoutFault(kase, fault)),
      }),
  };
}

export type CaseFaultEditing = ReturnType<typeof caseFaultEditing>;
