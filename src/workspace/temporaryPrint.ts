import type { PrintReport } from '../utils/printReport';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { PlateFiles, WrittenPlates } from './usePlateWriter';

export interface TemporaryPrint {
  key: string;
  parts: ScenePart[];
  report: PrintReport;
  sourceParts: ScenePart[];
  sourceProject: ProjectSettings;
  write: (plates: PlateFiles) => Promise<WrittenPlates>;
}
