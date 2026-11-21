import { useEffect, useEffectEvent, useState } from 'react';
import { CaseCheckPool } from '../cases/caseChecksClient';
import type { Case } from '../cases/schema';
import type { PlacementIdentity, RetainedPlacement } from '../cases/workbench/retention';
import type { CustomModelDefinition, ProjectSettings, ScenePart } from '../types/robotics';
import type { CaseRobotInput } from './caseChecks';
import { wireRobot } from './caseChecks';

interface Sources {
  fixtures?: CustomModelDefinition[];
  active: Case | null;
  parts: ScenePart[];
  project: ProjectSettings;
  caseRobot: () => Promise<CaseRobotInput | null>;
  records: RetainedPlacement[];
}

interface Verified {
  fixtures?: CustomModelDefinition[];
  active: Case;
  parts: ScenePart[];
  joints: ProjectSettings['joints'];
  selfContact: ProjectSettings['selfContact'];
  identity: PlacementIdentity;
}

function matches(verified: Verified | null, source: Sources): boolean {
  return (
    !!verified &&
    verified.active === source.active &&
    verified.parts === source.parts &&
    verified.joints === source.project.joints &&
    verified.selfContact === source.project.selfContact &&
    verified.fixtures === source.fixtures
  );
}

export function useWorkbenchVerification(source: Sources) {
  const { active, parts, project, records, fixtures } = source;
  const { joints, selfContact } = project;
  const [verified, setVerified] = useState<Verified | null>(null);
  const readRobot = useEffectEvent(source.caseRobot);
  const remember = (identity: PlacementIdentity) => {
    if (active)
      setVerified({ active, parts, joints: project.joints, selfContact: project.selfContact, identity, fixtures });
  };
  const onIdentity = useEffectEvent((identity: PlacementIdentity, before: Omit<Verified, 'identity'>) => {
    if (
      before.active !== active ||
      before.parts !== parts ||
      before.joints !== joints ||
      before.selfContact !== selfContact ||
      before.fixtures !== fixtures
    )
      return;

    remember(identity);
  });
  const ready = matches(verified, source);

  useEffect(() => {
    const record = records.find((own) => own.caseId === active?.id);

    if (!active || !record || ready) return;

    const pool = new CaseCheckPool();
    let live = true;
    const inspect = async () => {
      const input = await readRobot();

      if (!live || !input) return;

      const reply = await pool.run(0, {
        type: 'workbench-identity',
        unit: record.unit,
        pose: record.pose,
        kase: active,
        robot: wireRobot(input),
      });

      if (live) onIdentity(reply.identity, { active, parts, joints, selfContact, fixtures });
    };

    void inspect()
      .catch(() => {})
      .finally(() => pool.dispose());

    return () => {
      live = false;
      pool.dispose();
    };
  }, [active, parts, joints, selfContact, records, ready, fixtures]);

  return {
    remember,
    current: (record: RetainedPlacement) =>
      ready && verified?.identity.robotHash === record.robotHash && verified.identity.caseHash === record.caseHash,
  };
}
