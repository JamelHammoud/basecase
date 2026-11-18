import type { ScenePart, ProjectSettings } from '../types/robotics';
import { validateParameterRecords } from '../utils/designParameters/verification';
import { errorMessage } from '../utils/errorMessage';

export function permittedParameterEdit(
  parts: ScenePart[],
  project: ProjectSettings,
  refused?: (reason: string) => void,
) {
  try {
    validateParameterRecords(parts, project.designParameters);

    return true;
  } catch (error) {
    refused?.(errorMessage(error));

    return false;
  }
}
