import type { ProjectSettings, ScenePart } from '../types/robotics';
import { parameterDesignStatus } from '../utils/designParameters/verification';
import { ruleFinding } from './wording';

export function parameterFindings(parts: ScenePart[], parameters: ProjectSettings['designParameters']) {
  const status = parameterDesignStatus(parts, parameters);

  if (status.state === 'current') return [];

  const text = status.reason ?? 'Validate shared dimensions before building.';

  return [ruleFinding('design-parameters', 'blocker', { text, agentText: text, subject: 'parameters' })];
}
