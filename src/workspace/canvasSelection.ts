import type { CaseRun } from './useCaseRun';

const NO_SELECTION: string[] = [];

export const canvasSelection = (caseRun: Pick<CaseRun, 'live'>, selectedIds: string[]) =>
  caseRun.live ? NO_SELECTION : selectedIds;
