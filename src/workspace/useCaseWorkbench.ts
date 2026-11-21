import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { CaseCheckPool } from '../cases/caseChecksClient';
import type { WorkbenchPose } from '../cases/workbench/placement';
import { WorkbenchSession } from '../cases/workbench/session';
import { readPlacements, retainPlacement, updatedPlacements, type PlacementUpdate } from '../cases/workbench/retention';
import type { WorkbenchResult } from '../cases/workbench/rehearsal';
import { caseSlots, type Case } from '../cases/schema';
import type { CustomModelDefinition, ProjectSettings, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { wireRobot, type CaseRobotInput } from './caseChecks';
import type { ShowToast } from './types';
import type { Rig } from '../utils/kinematics';
import { useWorkbenchVerification } from './useWorkbenchVerification';
import { failureText } from '../readiness/caseChecks';
import { MISSED } from '../cases/caseRuns';

interface WorkbenchOptions {
  fixtures?: CustomModelDefinition[];
  rig: Rig;
  active: Case | null;
  parts: ScenePart[];
  project: ProjectSettings;
  caseRobot: () => Promise<CaseRobotInput | null>;
  commitWorkbenchPlacements: (update: PlacementUpdate) => void;
  showToast: ShowToast;
}

export function useCaseWorkbench(options: WorkbenchOptions) {
  const { active, parts, project } = options;
  const [session] = useState(() => new WorkbenchSession(() => new CaseCheckPool()));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const records = readPlacements(project.workbenchPlacements);
  const verification = useWorkbenchVerification({ ...options, records });
  const placements = records.filter((record) => record.caseId === active?.id);
  const source = {
    active,
    parts,
    joints: project.joints,
    selfContact: project.selfContact,
    fixtures: options.fixtures,
  };
  const latest = useRef(source);

  useLayoutEffect(() => {
    latest.current = source;
  });

  const stillHere = (before: typeof source) => {
    const now = latest.current;

    return (
      before.active === now.active &&
      before.parts === now.parts &&
      before.joints === now.joints &&
      before.selfContact === now.selfContact &&
      before.fixtures === now.fixtures
    );
  };
  const cancel = () => {
    session.cancel();
    setBusy(false);

    options.showToast('Canceled', { tone: 'neutral' });
  };
  const stop = useEffectEvent(() => {
    if (busy) cancel();

    session.cancel();
  });

  useEffect(() => () => stop(), [active, parts, project.joints, project.selfContact, options.fixtures]);

  const accept = (result: WorkbenchResult) => {
    if (!stillHere(source)) return;

    const record = retainPlacement(result.identity, result.rehearsal);

    options.commitWorkbenchPlacements((current) => updatedPlacements(current, record));
    verification.remember(result.identity);
    options.showToast(
      result.rehearsal.refusal ??
        (result.rehearsal.passed ? 'Passed' : failureText(result.rehearsal.failed[0] ?? MISSED)),
      { tone: result.rehearsal.passed ? 'success' : 'error' },
    );
  };

  const run = async (unit: string, pose: WorkbenchPose) => {
    if (!active || busy) return;

    setBusy(true);
    options.showToast('Rehearsing…', { tone: 'progress', action: { label: 'Cancel', onClick: cancel } });

    try {
      await session.run(
        async () => {
          const input = await options.caseRobot();

          if (!input || !stillHere(source)) return null;

          return {
            type: 'workbench',
            unit,
            kase: active,
            pose,
            robot: wireRobot(input),
          };
        },
        async (result) => accept(result),
      );
    } catch (error) {
      if (stillHere(source) && errorMessage(error) !== 'Canceled')
        options.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      if (stillHere(source)) setBusy(false);
    }
  };

  return {
    open,
    setOpen,
    show: () => setOpen(true),
    available: !!active && caseSlots(active).length === 1 && caseSlots(active)[0].needs.includes('arm'),
    busy,
    run,
    cancel,
    placements,
    pivot: options.rig.robots[0]?.pivot ?? ([0, 0, 0] as [number, number, number]),
    current: verification.current,
    caseId: active?.id ?? '',
  };
}

export type CaseWorkbench = ReturnType<typeof useCaseWorkbench>;
