import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import type { HardwareSpec } from '../../data/hardware';
import type { AlignMode, Axis } from '../../utils/selection';
import type { PlaneView } from '../../mirror/plane';
import { sheetOf } from '../../sheet/sheetStock';
import { madeElsewhereProcess } from '../../utils/bom';
import type { SheetThicknessOf } from '../../sheet/sheetThickness';

export type Phase = boolean | undefined;

export const MATERIALS: Array<{ value: string; label: string }> = [
  { value: '3D Printed PLA/PETG', label: 'Printed PLA / PETG' },
  { value: 'TPU Flexible', label: 'Printed TPU' },
  { value: 'Off-the-shelf COTS', label: 'Off-the-shelf' },
];

export const SHEET_OPTION = { value: 'sheet', label: 'Cut from sheet' };

const PRINTED_TAG = MATERIALS[0].value;
const OFF_THE_SHELF_TAG = MATERIALS[2].value;

const listedTag = (part: ScenePart): string =>
  MATERIALS.find((m) => m.value === part.mechanicalTag)?.value ??
  (madeElsewhereProcess(part) ? OFF_THE_SHELF_TAG : PRINTED_TAG);

export const materialTag = (part: ScenePart): string => (sheetOf(part) ? SHEET_OPTION.value : listedTag(part));

export const materialPatch = (tag: string): Partial<ScenePart> => ({ mechanicalTag: tag, sheet: undefined });

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
  sheetThicknessOf: SheetThicknessOf | null;
}
