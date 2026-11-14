import type { SceneAnnotation, ScenePart } from '../../types/robotics';
import type { HardwareSpec } from '../../data/hardware';
import type { AlignMode, Axis } from '../../utils/selection';
import type { PlaneView } from '../../mirror/plane';
import { SHEET_MATERIALS, SHEET_MATERIAL_IDS, isSheetMaterial, snapThickness } from '../../sheet/materials';
import { sheetOf } from '../../utils/bom';
import type { SelectOption } from '../../design-system';

export type Phase = boolean | undefined;

export const MATERIALS: SelectOption[] = [
  { value: '3D Printed PLA/PETG', label: 'Printed PLA / PETG' },
  { value: 'TPU Flexible', label: 'Printed TPU' },
  { value: 'Off-the-shelf COTS', label: 'Off-the-shelf' },
];

const PRINTED_TAG = MATERIALS[0].value;
const SHEET_PREFIX = 'sheet:';

export function materialValue(part: ScenePart): string {
  const sheet = sheetOf(part);

  if (sheet) return `${SHEET_PREFIX}${sheet}`;

  return MATERIALS.find((m) => m.value === part.mechanicalTag)?.value ?? PRINTED_TAG;
}

export function materialOptions(offerSheet: boolean, sheetMm: number | null): SelectOption[] {
  if (!offerSheet) return MATERIALS;

  return [
    ...MATERIALS,
    ...SHEET_MATERIAL_IDS.map((id) => ({
      value: `${SHEET_PREFIX}${id}`,
      label:
        sheetMm === null ? SHEET_MATERIALS[id].name : `${SHEET_MATERIALS[id].name}, ${snapThickness(id, sheetMm)} mm`,
      group: 'Cut from Sheet',
    })),
  ];
}

export function materialPatch(value: string): Partial<ScenePart> {
  const material = value.slice(SHEET_PREFIX.length);

  if (value.startsWith(SHEET_PREFIX) && isSheetMaterial(material))
    return { sheet: { material }, mechanicalTag: undefined };

  return { mechanicalTag: value, sheet: undefined };
}

export interface InspectorProps {
  part: ScenePart | null;
  sheetMm?: number | null;
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
}
