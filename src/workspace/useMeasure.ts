import { useState } from 'react';
import {
  DEFAULT_HUMAN_HEIGHT_MM,
  type FigureKind,
  type FigurePlacements,
  type MeasureKind,
  type Vec3,
} from '../three/viewport/types';

export function useMeasure() {
  const [measuring, setMeasuringState] = useState(false);
  const [kind, setKind] = useState<MeasureKind>('ruler');
  const [figures, setFigures] = useState<FigurePlacements>({});
  const [humanHeightMm, setHumanHeightMm] = useState(DEFAULT_HUMAN_HEIGHT_MM);

  const setMeasuring = (on: boolean) => {
    setMeasuringState(on);

    if (on) return;

    setKind('ruler');
    setFigures({});
  };

  const placeFigure = (figure: FigureKind, point: Vec3) => setFigures((placed) => ({ ...placed, [figure]: point }));

  return {
    measuring,
    setMeasuring,
    kind,
    setKind,
    figures,
    placeFigure,
    humanHeightMm,
    setHumanHeightMm,
  };
}

export type Measure = ReturnType<typeof useMeasure>;
