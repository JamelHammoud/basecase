import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import type { HardwareSpec } from '../../data/hardware';
import type { AlignMode, Axis } from '../../utils/selection';

export type Phase = boolean | undefined;

export const MATERIALS: Array<{ value: string; label: string }> = [
  { value: '3D Printed PLA/PETG', label: 'Printed · PLA / PETG' },
  { value: 'TPU Flexible', label: 'Printed · TPU' },
  { value: 'Off-the-shelf COTS', label: 'Off-the-shelf' },
  { value: 'CNC Aluminum', label: 'CNC aluminum' },
  { value: 'Laser-Cut Acrylic/Carbon', label: 'Laser-cut sheet' },
  { value: 'Cutout / Clearance', label: 'Clearance' },
  { value: 'Reference Axis', label: 'Reference' },
];

export interface InspectorProps {
  part: ScenePart | null;
  parts: ScenePart[];
  globalGoal: string;
  onChangeGoal: (goal: string, live?: Phase) => void;
  snapStepMm: number;
  onUpdate: (patch: Partial<ScenePart>, live?: Phase) => void;
  onDuplicate: () => void;
  onSaveAsModel: () => void;
  onDelete: () => void;
  onDropToFloor: () => void;
  onStack: () => void;
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
}
