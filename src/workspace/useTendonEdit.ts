import { useState } from 'react';
import type { IdealTendon } from '../types/tendon';
import { withTendons } from '../joints/tendons';
import { confirmAction } from '../design-system/confirmStore';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useTendonEdit(core: WorkspaceCore) {
  const [tendonMotor, setTendonMotor] = useState<string | null>(null);
  const { docs, posing, tool } = core;
  const active = posing.rig.byId.get(posing.activeJointId ?? '');
  const canEditTendon = active?.type === 'revolute' && active.actuation !== 'passive' && !!active.actuators?.length;
  const editTendon = (id = active?.id) => {
    if (!id) return;

    tool.openRightTab('pose');
    posing.selectJoint(id);
    setTendonMotor(id);
  };
  const saveTendon = (motor: string, tendon: IdealTendon | null) => {
    const next = withTendons(docs.projectRef.current, docs.partsRef.current, [{ motor, tendon }]);

    docs.commitJoints(() => next);
  };
  const deleteTendon = (motor: string) =>
    confirmAction({
      title: 'Delete tendon?',
      onConfirm: () => {
        saveTendon(motor, null);
        setTendonMotor(null);
      },
    });

  return { tendonMotor, canEditTendon, editTendon, saveTendon, deleteTendon, closeTendon: () => setTendonMotor(null) };
}
