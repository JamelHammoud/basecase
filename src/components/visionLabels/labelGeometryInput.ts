import type { ImageAnnotation, TrainingFrame } from '../../vision/frameSet';
import type { LabelGeometry } from '../../vision/labelEdits';

export interface LabelDrawingShape {
  box?: ImageAnnotation['box'];
  polygons?: number[][];
  preserveHoles?: boolean;
  replace?: boolean;
}

interface LabelDrawingContext {
  frame: Pick<TrainingFrame, 'width' | 'height'>;
  classId: number;
  label?: ImageAnnotation;
}

export function labelGeometryInput(shape: LabelDrawingShape, context: LabelDrawingContext): LabelGeometry {
  const { replace, ...geometry } = shape;
  const previous = replace ? context.label : undefined;

  return {
    ...geometry,
    width: context.frame.width,
    height: context.frame.height,
    classId: context.classId,
    instance: previous?.instance ?? crypto.randomUUID(),
    keypoints: previous?.keypoints,
  };
}
