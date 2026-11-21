import type { RequirementOutcome } from './requirementTypes';

export const REQUIREMENT_REASONS: Record<RequirementOutcome['reason'], string> = {
  passed: 'Passed',
  floor: 'Below score floor',
  regression: 'Exceeded permitted regression',
  'missing-group': 'Missing group',
  'insufficient-support': 'Insufficient real test',
  unavailable: 'Evidence unavailable',
  resources: 'Evaluation limit exceeded',
};
