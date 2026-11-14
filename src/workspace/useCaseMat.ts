import { caseSlug } from '../cases/caseBuilder';
import { stageCase, type StagedCase } from '../cases/caseCast';
import { caseMat, isGround, paperFor, type CaseMat } from '../cases/mat/matLayout';
import { matPdf } from '../cases/mat/matPdf';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import type { ScenePart } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import type { Rig } from '../utils/kinematics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';

export interface StagedMat {
  staged: StagedCase;
  mat: CaseMat;
}

interface CaseMatOptions {
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  partners: () => SlotRobot[];
}

export interface CaseMatExport {
  available: boolean;
  matOf: () => StagedMat | null;
  exportMat: () => void;
}

export function stagedMat(kase: Case, scene: { rig: Rig; parts: ScenePart[] }, partners: SlotRobot[]) {
  const staged = stageCase(kase, scene, partners);
  const mat = caseMat(staged.kase, scene, paperFor(navigator.language));

  return mat && { staged, mat };
}

export function useCaseMat({ rig, parts, active, partners }: CaseMatOptions): CaseMatExport {
  const available = !IS_WEB_DEMO && !!active && rig.robots.length > 0 && isGround(active);
  const matOf = () => (available && active ? stagedMat(active, { rig, parts }, partners()) : null);

  const exportMat = () => {
    const made = matOf();

    if (!made || !active) return;

    downloadBytes(matPdf(made.mat), `${caseSlug(active.name)}-mat.pdf`, 'application/pdf');
  };

  return { available, matOf, exportMat };
}
