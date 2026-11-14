import type { CaseAction } from '../../../cases/console/panelKinds';

export const BUTTON_LABELS: Record<CaseAction, string> = {
  try: 'Try It',
  'end-try': 'Stop Try',
  drive: 'Drive',
  stop: 'Stop Driving',
  'start-over': 'Start Over',
  reset: 'Reset',
};
