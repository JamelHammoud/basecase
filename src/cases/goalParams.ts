export type ParamKey =
  | 'dots'
  | 'distanceMm'
  | 'heightMm'
  | 'sideMm'
  | 'radiusMm'
  | 'pushMm'
  | 'boxMm'
  | 'stops'
  | 'spacingMm'
  | 'seconds'
  | 'riseMm'
  | 'inclineDeg';

export type GoalValues = Record<ParamKey, number>;

export interface GoalParam {
  key: ParamKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}
