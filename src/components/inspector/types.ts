import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import type { HardwareSpec } from '../../data/hardware';
import type { AlignMode, Axis } from '../../utils/selection';
import type { PlaneView } from '../../mirror/plane';
import { partSheet } from '../../sheet/materials';

export type Phase = boolean | undefined;

export const MATERIALS: Array<{ value: string; label: string }> = [
  { value: '3D Printed PLA/PETG', label: 'Printed PLA / PETG' },
  { value: 'TPU Flexible', label: 'Printed TPU' },
  { value: 'Off-the-shelf COTS', label: 'Off-the-shelf' },
];

export const SHEET_VALUE = 'sheet';

const PRINTED_TAG = MATERIALS[0].value;

export const materialOptions = (canCut: boolean) =>
  canCut ? [...MATERIALS, { value: SHEET_VALUE, label: 'Cut from sheet' }] : MATERIALS;

export function materialTag(part: ScenePart): string {
  if (partSheet(part)) return SHEET_VALUE;

  return MATERIALS.find((m) => m.value === part.mechanicalTag)?.value ?? PRINTED_TAG;
}

export const madeWith = (tag: string): Partial<ScenePart> => ({ mechanicalTag: tag, sheet: undefined });

export interface InspectorProps {
  part: ScenePart | null;
  parts: ScenePart[];
  globalGoal: string;
  onChangeGoal: (goal: string, live?: Phase) => void;
  snapStepMm: number;
  onUpdate: (patch: Partial<ScenePart>, live?: Phase) => void;
  onDuplicate: () => void;
  onMirror: (view: PlaneView) => void;
  onSaveAsModel: () => void;
  onDelete: () => void;
  onDropToFloor: () => void;
  onStack: () => void;
  onCenter: () => void;
  annotations: SceneAnnotation[];
  activeAnnotationId: string | null;
  onOpenAnnotation: (id: string) => void;
  onAddComment: () => void;
  selectedParts: ScenePart[];
  onUpdateMany: (patch: Partial<ScenePart>) => void;
  onBoolean: (op: 'subtract' | 'union' | 'intersect') => void;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (axis: Axis, mode: AlignMode) => void;
  onDistribute: (axis: Axis) => void;
  onMoveSelection: (target: Partial<Record<Axis, number>>, live?: Phase) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onRotateSelection: (axis: Axis) => void;
  onChangeHardware: (spec: HardwareSpec, live?: Phase) => void;
  onAddClearanceHole: () => void;
  onTuneDimensions: (id: string, values: Record<string, number>) => Promise<void>;
  sheetMm?: number | null;
}
