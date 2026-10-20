import React from 'react';
import type { ScenePart } from '../../types/robotics';
import { AlignBar, StripButton, StripGroup } from '../AlignControls';
import { selectionBounds, type Axis } from '../../utils/selection';
import {
  ColorField,
  IconButton,
  NumberInput,
  Section,
  Select,
  useScrollFade,
  BookmarkAddIcon,
  CopyIcon,
  CrosshairIcon,
  DeleteIcon,
  FloorIcon,
  GroupIcon,
  IntersectIcon,
  RotateRightIcon,
  SubtractIcon,
  UngroupIcon,
  UnionIcon,
} from '../../design-system';
import { GroupName } from './GroupName';
import { MATERIALS, type InspectorProps } from './types';

const fmt = (v: number) => String(Math.round(v * 10) / 10);

const isWholeGroup = (selectedParts: ScenePart[], parts: ScenePart[]): boolean => {
  const base = selectedParts[0];
  const groupIds = new Set(selectedParts.map((p) => p.group?.id));

  if (groupIds.size !== 1 || !base.group) return false;

  return parts.filter((p) => p.group?.id === base.group!.id).length === selectedParts.length;
};

const MultiHeader: React.FC<InspectorProps & { wholeGroup: boolean; size: number[] }> = ({
  selectedParts,
  wholeGroup,
  size,
  onRenameGroup,
  onUngroup,
  onGroup,
  onDuplicate,
  onSaveAsModel,
  onDelete,
}) => {
  const base = selectedParts[0];
  const anyGrouped = selectedParts.some((p) => p.group);

  return (
    <div className="px-[12px] pt-4 pb-4 border-b border-white/[0.06]">
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0">
          {wholeGroup ? (
            <div className="-ml-[8.75px]">
              <GroupName
                key={base.group!.id}
                name={base.group!.name}
                onRename={(name) => onRenameGroup(base.group!.id, name)}
              />
            </div>
          ) : (
            <div className="text-[14px] font-semibold text-white/95 truncate h-8 flex items-center">
              {selectedParts.length} parts
            </div>
          )}
        </div>
        {anyGrouped && (
          <IconButton
            icon={<UngroupIcon className="w-3.5 h-3.5" />}
            title="Ungroup"
            shortcut="⇧⌘G"
            size="xs"
            onClick={onUngroup}
          />
        )}
        {!wholeGroup && (
          <IconButton
            icon={<GroupIcon className="w-3.5 h-3.5" />}
            title="Group"
            shortcut="⌘G"
            size="xs"
            onClick={onGroup}
          />
        )}
        <IconButton
          icon={<CopyIcon className="w-3.5 h-3.5" />}
          title="Duplicate"
          shortcut="⌘D"
          size="xs"
          onClick={onDuplicate}
        />
        <IconButton
          icon={<BookmarkAddIcon className="w-3.5 h-3.5" />}
          title="Save to Library"
          size="xs"
          onClick={onSaveAsModel}
        />
        <IconButton
          icon={<DeleteIcon className="w-3.5 h-3.5" />}
          title="Delete"
          shortcut="⌫"
          size="xs"
          variant="danger"
          onClick={onDelete}
        />
      </div>
      <div className="text-[12.5px] text-white/45 tabular mt-0.5">
        {wholeGroup && <>{selectedParts.length} parts · </>}
        {fmt(size[0])} × {fmt(size[1])} × {fmt(size[2])} <span className="text-white/30">mm</span>
      </div>
    </div>
  );
};

const MultiTransformSections: React.FC<InspectorProps & { center: number[] }> = ({
  selectedParts,
  center,
  onAlign,
  onDistribute,
  onDropToFloor,
  onMoveSelection,
  onRotateSelection,
}) => (
  <>
    <Section title="Align">
      <AlignBar count={selectedParts.length} onAlign={onAlign} onDistribute={onDistribute} />
    </Section>

    <Section
      title="Position"
      actions={
        <>
          <IconButton
            icon={<FloorIcon className="w-3.5 h-3.5" />}
            title="Drop to floor"
            shortcut="F"
            size="xs"
            onClick={onDropToFloor}
          />
          <IconButton
            icon={<CrosshairIcon className="w-3.5 h-3.5" />}
            title="Center on origin"
            size="xs"
            onClick={() => onMoveSelection({ 0: 0, 2: 0 })}
          />
        </>
      }
    >
      <div className="grid grid-cols-3 gap-1.5">
        {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
          <NumberInput
            key={axis}
            label={axis}
            title={`Center ${axis}`}
            value={center[idx]}
            onChange={(v, l) => onMoveSelection({ [idx]: v }, l)}
          />
        ))}
      </div>
    </Section>

    <Section title="Rotate">
      <StripGroup>
        {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
          <StripButton key={axis} title={`Rotate 90° around ${axis}`} onClick={() => onRotateSelection(idx as Axis)}>
            <RotateRightIcon className="w-3.5 h-3.5" />
            <span className="tabular">
              {axis} <span className="text-white/45">90°</span>
            </span>
          </StripButton>
        ))}
      </StripGroup>
    </Section>
  </>
);

const MultiAppearance: React.FC<InspectorProps> = ({ selectedParts, parts, onBoolean, onUpdateMany }) => {
  const base = selectedParts[0];
  const colors = new Set(selectedParts.map((p) => p.color.toLowerCase()));
  const materials = new Set(selectedParts.map((p) => p.mechanicalTag || '3D Printed PLA/PETG'));

  return (
    <>
      <Section title="Combine">
        <StripGroup>
          <StripButton title="Merge into one solid" onClick={() => onBoolean('union')}>
            <UnionIcon className="w-4 h-4" />
            Union
          </StripButton>
          <StripButton
            title={`Cut the others out of ${base.name}`}
            onClick={() => onBoolean('subtract')}
            className="hover:!bg-red-500/[0.16] hover:!text-red-200"
          >
            <SubtractIcon className="w-4 h-4" />
            Subtract
          </StripButton>
          <StripButton title="Keep only the shared volume" onClick={() => onBoolean('intersect')}>
            <IntersectIcon className="w-4 h-4" />
            Intersect
          </StripButton>
        </StripGroup>
      </Section>

      <Section title="Appearance">
        <ColorField
          value={base.color}
          mixed={colors.size > 1}
          suggestions={parts.map((p) => p.color)}
          onChange={(color) => onUpdateMany({ color })}
        />
        <Select
          aria-label="Material"
          value={materials.size > 1 ? '' : [...materials][0]}
          onChange={(e) => e.target.value && onUpdateMany({ mechanicalTag: e.target.value })}
          options={materials.size > 1 ? [{ value: '', label: 'Mixed' }, ...MATERIALS] : MATERIALS}
        />
      </Section>
    </>
  );
};

export const MultiInspector: React.FC<InspectorProps> = (props) => {
  const { selectedParts, parts } = props;
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const wholeGroup = isWholeGroup(selectedParts, parts);
  const { min, max } = selectionBounds(selectedParts);
  const size = [0, 1, 2].map((i) => max[i] - min[i]);
  const center = [0, 1, 2].map((i) => Math.round(((min[i] + max[i]) / 2) * 10) / 10);

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <MultiHeader {...props} wholeGroup={wholeGroup} size={size} />
      <MultiTransformSections {...props} center={center} />
      <MultiAppearance {...props} />
    </div>
  );
};
