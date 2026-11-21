import type { MeshMeasure } from '../meshMeasure';
import type { PrintPose } from '../printability';
import type { SheetProfile } from '../../types/sheet';
import type { ShapeReport } from './shapeReports';

const vector = <T extends number[]>(value: T): T => value.slice() as T;

const sheetCopy = (sheet: SheetProfile): SheetProfile => ({
  ...sheet,
  normal: vector(sheet.normal),
  ...(sheet.center ? { center: vector(sheet.center) } : {}),
  outline: sheet.outline.map(vector),
  holes: sheet.holes.map((hole) => hole.map(vector)),
});

const measureCopy = (measure: MeshMeasure): MeshMeasure => ({
  ...measure,
  min: vector(measure.min),
  max: vector(measure.max),
  centroid: vector(measure.centroid),
  ...(measure.base ? { base: measure.base.map(vector) } : {}),
  ...(measure.sheet ? { sheet: sheetCopy(measure.sheet) } : {}),
});

const poseCopy = (pose: PrintPose): PrintPose => ({
  ...pose,
  down: vector(pose.down),
  rotation: vector(pose.rotation),
  min: vector(pose.min),
  size: vector(pose.size),
});

export const ownedShapeReport = (report: ShapeReport): ShapeReport => ({
  ...report,
  check: report.check ? { ...report.check, poses: report.check.poses.map(poseCopy) } : null,
  measure: measureCopy(report.measure),
});
