import type { ScenePart } from '../types/robotics';
import { sketchSupportFindings } from '../readiness/sketchSupports';
import { unresolvedCradleSources } from '../print/cradleSourceState';

export function cradleSourcesCurrent(parts: ScenePart[], parametersCurrent: boolean): boolean {
  return parametersCurrent && !unresolvedCradleSources(parts) && sketchSupportFindings(parts).length === 0;
}
