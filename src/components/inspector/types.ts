import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import type { HardwareSpec } from '../../data/hardware';
import type { AlignMode, Axis } from '../../utils/selection';
import type { PlaneView } from '../../mirror/plane';
import type { SheetProfile } from '../../sheet/detect';
import { sheetOf } from '../../sheet/materials';
import { PRINTED_TAG } from '../../sheet/sheetPatch';

export type Phase = boolean | undefined;

export const MATERIALS: Array<{ value: string; label: string }> = [
  { value: '3D Printed PLA/PETG', label: 'Printed PLA / PETG' },
  { value: 'TPU Flexible', label: 'Printed TPU' },
  { value: 'Off-the-shelf COTS', label: 'Off-the-shelf' },
];

export const CUT_FROM_SHEET = { value: 'sheet', label: 'Cut from Sheet' };

export const materialTag = (part: ScenePart): string => {
  if (sheetOf(part)) return CUT_FROM_SHEET.value;

  return MATERIALS.find((m) => m.value === part.mechanicalTag)?.value ?? PRINTED_TAG;
};

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
  sheetFit: SheetProfile | null;
}
