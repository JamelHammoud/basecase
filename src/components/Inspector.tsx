import React from 'react';
import {
  ArrowDownToLine,
  BookmarkPlus,
  Copy,
  Group,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Ungroup,
  Crosshair,
  Layers,
  MessageCircle,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { SceneAnnotation, ScenePart } from '../types/robotics';
import { timeAgo } from '../utils/timeAgo';
import { HardwareSpec, familyOf } from '../data/hardware';
import { HardwareConfigurator } from './HardwareConfigurator';
import { COMPONENT_BY_ID } from '../data/components';
import { ComponentLinks, ModelSource, SizeLine, SpecList } from './PartDetails';
import { AlignBar, StripButton, StripGroup } from './AlignControls';
import { selectionBounds } from '../utils/selection';
import type { AlignMode, Axis } from '../utils/selection';
import {
  Button,
  ColorField,
  IconButton,
  NumberInput,
  Section,
  SegmentedControl,
  Select,
  Slider,
  TextArea,
  TextInput,
  Tooltip,
  useScrollFade,
} from '../design-system';


/** Stored values feed the AI brief; labels are what people read. */
const MATERIALS: Array<{ value: string; label: string }> = [
  { value: '3D Printed PLA/PETG', label: 'Printed · PLA / PETG' },
  { value: 'TPU Flexible', label: 'Printed · TPU' },
  { value: 'Off-the-shelf COTS', label: 'Off-the-shelf' },
  { value: 'CNC Aluminum', label: 'CNC aluminum' },
  { value: 'Laser-Cut Acrylic/Carbon', label: 'Laser-cut sheet' },
  { value: 'Cutout / Clearance', label: 'Clearance' },
  { value: 'Reference Axis', label: 'Reference' },
];

type Phase = boolean | undefined;

interface InspectorProps {
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
  /** Multi-selection (ordered; first is the boolean base) */
  selectedParts: ScenePart[];
  onUpdateMany: (patch: Partial<ScenePart>) => void;
  onBoolean: (op: 'subtract' | 'union' | 'intersect') => void;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (axis: Axis, mode: AlignMode) => void;
  onDistribute: (axis: Axis) => void;
  /** Moves the selection's bounds center to `target` on the given axes; `live` while scrubbing */
  onMoveSelection: (target: Partial<Record<Axis, number>>, live?: Phase) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  /** Turns the selection 90° about its center */
  onRotateSelection: (axis: Axis) => void;
  onChangeHardware: (spec: HardwareSpec, live?: Phase) => void;
  onAddClearanceHole: () => void;
}

export const Inspector: React.FC<InspectorProps> = (props) =>
  props.selectedParts.length > 1 ? (
    <MultiInspector {...props} />
  ) : props.part ? (
    <PartInspector {...props} part={props.part} />
  ) : (
    <SceneInspector {...props} />
  );

/* ------------------------------------------------------------------ */

const MultiInspector: React.FC<InspectorProps> = ({
  selectedParts,
  parts,
  onUpdateMany,
  onBoolean,
  onGroup,
  onUngroup,
  onAlign,
  onDistribute,
  onDuplicate,
  onSaveAsModel,
  onDelete,
  onDropToFloor,
  onMoveSelection,
  onRotateSelection,
  onRenameGroup,
}) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const base = selectedParts[0];
  const groupIds = new Set(selectedParts.map((p) => p.group?.id));
  const wholeGroup =
    groupIds.size === 1 && base.group
      ? parts.filter((p) => p.group?.id === base.group!.id).length === selectedParts.length
      : false;
  const anyGrouped = selectedParts.some((p) => p.group);
  const colors = new Set(selectedParts.map((p) => p.color.toLowerCase()));
  const materials = new Set(selectedParts.map((p) => p.mechanicalTag || '3D Printed PLA/PETG'));

  // Position and size are the selection's bounds, like a multi-selection in Figma
  const { min, max } = selectionBounds(selectedParts);
  const size = [0, 1, 2].map((i) => max[i] - min[i]);
  const center = [0, 1, 2].map((i) => Math.round(((min[i] + max[i]) / 2) * 10) / 10);
  const fmt = (v: number) => String(Math.round(v * 10) / 10);

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {/* Identity: the group (renamable) or the count, with the selection's overall size */}
      <div className="px-[12px] pt-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            {wholeGroup ? (
              <div className="-ml-[8.75px]">
                <GroupName key={base.group!.id} name={base.group!.name} onRename={(name) => onRenameGroup(base.group!.id, name)} />
              </div>
            ) : (
              <div className="text-[14px] font-semibold text-white/95 truncate h-8 flex items-center">{selectedParts.length} parts</div>
            )}
          </div>
          {anyGrouped && (
            <IconButton icon={<Ungroup className="w-3.5 h-3.5" />} title="Ungroup" shortcut="⇧⌘G" size="xs" onClick={onUngroup} />
          )}
          {!wholeGroup && (
            <IconButton icon={<Group className="w-3.5 h-3.5" />} title="Group" shortcut="⌘G" size="xs" onClick={onGroup} />
          )}
          <IconButton icon={<Copy className="w-3.5 h-3.5" />} title="Duplicate" shortcut="⌘D" size="xs" onClick={onDuplicate} />
          <IconButton icon={<BookmarkPlus className="w-3.5 h-3.5" />} title="Save to Library" size="xs" onClick={onSaveAsModel} />
          <IconButton icon={<Trash2 className="w-3.5 h-3.5" />} title="Delete" shortcut="⌫" size="xs" variant="danger" onClick={onDelete} />
        </div>
        <div className="text-[12.5px] text-white/45 tabular mt-0.5">
          {wholeGroup && <>{selectedParts.length} parts · </>}
          {fmt(size[0])} × {fmt(size[1])} × {fmt(size[2])} <span className="text-white/30">mm</span>
        </div>
      </div>

      <Section title="Align">
        <AlignBar count={selectedParts.length} onAlign={onAlign} onDistribute={onDistribute} />
      </Section>

      <Section
        title="Position"
        actions={
          <>
            <IconButton icon={<ArrowDownToLine className="w-3.5 h-3.5" />} title="Drop to floor" shortcut="F" size="xs" onClick={onDropToFloor} />
            <IconButton
              icon={<Crosshair className="w-3.5 h-3.5" />}
              title="Center on origin"
              size="xs"
              onClick={() => onMoveSelection({ 0: 0, 2: 0 })}
            />
          </>
        }
      >
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
            <NumberInput key={axis} label={axis} title={`Center ${axis}`} value={center[idx]} onChange={(v, l) => onMoveSelection({ [idx]: v }, l)} />
          ))}
        </div>
      </Section>

      <Section title="Rotate">
        <StripGroup>
          {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
            <StripButton key={axis} title={`Rotate 90° around ${axis}`} onClick={() => onRotateSelection(idx as Axis)}>
              <RotateCw className="w-3.5 h-3.5" />
              <span className="tabular">
                {axis} <span className="text-white/45">90°</span>
              </span>
            </StripButton>
          ))}
        </StripGroup>
      </Section>

      <Section title="Combine">
        <StripGroup>
          <StripButton title="Merge into one solid" onClick={() => onBoolean('union')}>
            <SquaresUnite className="w-4 h-4" />
            Union
          </StripButton>
          <StripButton title={`Cut the others out of ${base.name}`} onClick={() => onBoolean('subtract')} className="hover:!bg-red-500/[0.16] hover:!text-red-200">
            <SquaresSubtract className="w-4 h-4" />
            Subtract
          </StripButton>
          <StripButton title="Keep only the shared volume" onClick={() => onBoolean('intersect')}>
            <SquaresIntersect className="w-4 h-4" />
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
    </div>
  );
};

/** The group's name, edited in place; commits once on Enter or blur */
const GroupName: React.FC<{ name: string; onRename: (name: string) => void }> = ({ name, onRename }) => {
  const [draft, setDraft] = React.useState(name);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    else setDraft(name);
  };
  return (
    <TextInput
      bare
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      aria-label="Group name"
      className="font-semibold text-[14px]"
    />
  );
};

/* ------------------------------------------------------------------ */

const SceneInspector: React.FC<InspectorProps> = (props) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const { globalGoal, onChangeGoal } = props;

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <Section title="Project description" collapsible defaultOpen={false}>
        <TextArea
          rows={6}
          value={globalGoal}
          onChange={(e) => onChangeGoal(e.target.value, true)}
          onBlur={(e) => onChangeGoal(e.target.value, false)}
        />
      </Section>

      <CommentsSection {...props} list={props.annotations} />
    </div>
  );
};

/** Thread list. Clicking a row opens it on the canvas. */
const CommentsSection: React.FC<InspectorProps & { list: SceneAnnotation[] }> = ({
  list,
  annotations,
  activeAnnotationId,
  onOpenAnnotation,
  onAddComment,
}) => (
  <Section
    title="Comments"
    className={list.length === 0 ? 'pb-1' : ''}
    actions={
      <IconButton icon={<Plus className="w-3.5 h-3.5" />} title="Add comment" shortcut="M" size="xs" onClick={onAddComment} />
    }
  >
    {list.length > 0 && (
      <ul className="-mx-2 space-y-px" data-annotation-list>
        {list.map((a) => {
          const n = annotations.findIndex((x) => x.id === a.id) + 1;
          const first = a.comments[0];
          const active = a.id === activeAnnotationId;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onOpenAnnotation(a.id)}
                className={`w-full text-left px-2 py-2 rounded-lg flex items-start gap-2.5 cursor-default transition-colors ${
                  active ? 'bg-[#0d99ff]/[0.16]' : 'hover:bg-white/[0.05]'
                } ${a.resolved ? 'opacity-50' : ''}`}
              >
                <span
                  className={`mt-0.5 w-6 h-6 shrink-0 rounded-[12px_12px_12px_3px] text-[11.5px] font-semibold tabular flex items-center justify-center ${
                    active ? 'bg-[#0d99ff] text-white' : 'bg-white text-black'
                  }`}
                >
                  {n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-white/85 truncate">{first?.text}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-white/40">
                    {a.resolved ? 'Resolved' : timeAgo(first?.createdAt ?? a.createdAt)}
                    {a.comments.length > 1 && (
                      <>
                        <span>·</span>
                        <MessageCircle className="w-3 h-3" />
                        <span className="tabular">{a.comments.length - 1}</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </Section>
);

/** Wrap to (-180, 180] so rotations read naturally */
function wrapDegrees(a: number): number {
  const r = ((((a + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/* ------------------------------------------------------------------ */

const PartInspector: React.FC<InspectorProps & { part: ScenePart }> = (props) => {
  const partComments = props.annotations.filter((a) => a.partId === props.part.id);
  return <PartInspectorBody {...props} partComments={partComments} />;
};

const PartInspectorBody: React.FC<InspectorProps & { part: ScenePart; partComments: SceneAnnotation[] }> = (props) => {
  const { ref: setFadeEl, style: fadeStyle } = useScrollFade();
  const {
  part,
  snapStepMm,
  onUpdate,
  onDuplicate,
  onSaveAsModel,
  onDelete,
  onDropToFloor,
  onStack,
  partComments,
  } = props;
  const d = part.deformers || {};
  const hasDeform =
    !!d.taper || !!d.bendDeg || !!d.twistDeg || !!d.roundness;

  const isImage = part.kind === 'image_plane';
  const hw = part.hardware;
  const comp = part.componentId ? COMPONENT_BY_ID[part.componentId] : undefined;

  const setDim = (key: 'width' | 'height' | 'depth' | 'thickness', v: number, live?: Phase) => {
    const next = Math.max(1, v);
    // Photos keep their aspect ratio
    if (isImage && (key === 'width' || key === 'height')) {
      const ratio = part.dimensions.height / part.dimensions.width;
      const width = key === 'width' ? next : Math.round((next / ratio) * 10) / 10;
      const height = key === 'height' ? next : Math.round(next * ratio * 10) / 10;
      onUpdate({ dimensions: { ...part.dimensions, width, height } }, live);
      return;
    }
    onUpdate({ dimensions: { ...part.dimensions, [key]: next } }, live);
  };

  const setPos = (idx: number, v: number, live?: Phase) => {
    const next: [number, number, number] = [...part.position];
    next[idx] = v;
    onUpdate({ position: next }, live);
  };

  const setRot = (idx: number, v: number, live?: Phase) => {
    const next: [number, number, number] = [...part.rotation];
    next[idx] = wrapDegrees(v);
    onUpdate({ rotation: next }, live);
  };

  const setDeformer = (key: keyof NonNullable<ScenePart['deformers']>, v: number, live?: Phase) =>
    onUpdate({ deformers: { ...part.deformers, [key]: v } }, live);

  return (
    <div ref={setFadeEl} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {/* Identity */}
      <div className="px-[12px] pt-4 pb-4 border-b border-white/[0.06] space-y-2.5">
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0 -ml-[8.75px]">
            <TextInput
              bare
              value={part.name}
              onChange={(e) => onUpdate({ name: e.target.value }, true)}
              onBlur={(e) => onUpdate({ name: e.target.value.trim() || part.name }, false)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Part name"
              className="font-semibold text-[14px]"
            />
          </div>
          <IconButton icon={<Copy className="w-3.5 h-3.5" />} title="Duplicate" shortcut="⌘D" size="xs" onClick={onDuplicate} />
          <IconButton icon={<BookmarkPlus className="w-3.5 h-3.5" />} title="Save to Library" size="xs" onClick={onSaveAsModel} />
          <IconButton icon={<Trash2 className="w-3.5 h-3.5" />} title="Delete" shortcut="⌫" size="xs" variant="danger" onClick={onDelete} />
        </div>
        {isImage && <p className="text-[12.5px] text-white/45">Reference image · not printed or exported</p>}
      </div>

      {isImage && (
        <Section title="Image">
          {part.imageDataUrl && (
            <img src={part.imageDataUrl} alt="" className="w-full max-h-40 object-contain rounded-lg bg-black/30" />
          )}
          <Slider
            label="Opacity"
            min={0.1}
            max={1}
            step={0.05}
            defaultValue={1}
            value={part.opacity ?? 1}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v, l) => onUpdate({ opacity: v }, l)}
          />
          <SegmentedControl<'up' | 'flat' | ''>
            size="sm"
            value={
              part.rotation[0] === 0 && part.rotation[2] === 0
                ? 'up'
                : Math.abs(part.rotation[0]) === 90 && part.rotation[2] === 0
                  ? 'flat'
                  : ''
            }
            onChange={(v) =>
              v === 'up'
                ? onUpdate({ rotation: [0, part.rotation[1], 0], position: [part.position[0], part.dimensions.height / 2, part.position[2]] })
                : onUpdate({ rotation: [-90, part.rotation[1], 0], position: [part.position[0], 0.2, part.position[2]] })
            }
            options={[
              { value: 'up', label: 'Stand Up', title: 'Upright, like a backdrop' },
              { value: 'flat', label: 'Lay Flat', title: 'On the floor, like a blueprint' },
            ]}
          />
        </Section>
      )}

      {hw && (
        <HardwareSection
          spec={hw}
          onChange={props.onChangeHardware}
          onAddClearanceHole={props.onAddClearanceHole}
        />
      )}

      {!hw && !comp && (
      <Section title="Size">
        <div className={`grid ${isImage ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5`}>
          <NumberInput label="W" title="Width (X)" value={part.dimensions.width} min={1} max={2000} onChange={(v, l) => setDim('width', v, l)} />
          <NumberInput label="H" title="Height (Y)" value={part.dimensions.height} min={1} max={2000} onChange={(v, l) => setDim('height', v, l)} />
          {!isImage && (
            <NumberInput label="D" title="Depth (Z)" value={part.dimensions.depth} min={1} max={600} onChange={(v, l) => setDim('depth', v, l)} />
          )}
        </div>
        {part.dimensions.thickness !== undefined && (
          <div className="grid grid-cols-3 gap-1.5 items-center">
            <span className="col-span-2 text-[13px] text-white/50">Wall thickness</span>
            <NumberInput label="T" title="Wall thickness" value={part.dimensions.thickness} min={1} max={50} step={0.5} onChange={(v, l) => setDim('thickness', v, l)} />
          </div>
        )}
      </Section>
      )}

      <Section
        title="Position"
        actions={
          <>
            <IconButton icon={<ArrowDownToLine className="w-3.5 h-3.5" />} title="Drop to floor" shortcut="F" size="xs" onClick={onDropToFloor} />
            <IconButton icon={<Layers className="w-3.5 h-3.5" />} title="Stack on part below" shortcut="S" size="xs" onClick={onStack} />
            <IconButton
              icon={<Crosshair className="w-3.5 h-3.5" />}
              title="Center on origin"
              size="xs"
              onClick={() => onUpdate({ position: [0, part.position[1], 0] })}
            />
          </>
        }
      >
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
            <NumberInput
              key={axis}
              label={axis}
              value={part.position[idx]}
              step={snapStepMm || 1}
              onChange={(v, l) => setPos(idx, v, l)}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Rotation"
        actions={
          <IconButton
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            title="Reset rotation"
            size="xs"
            disabled={part.rotation.every((r) => r === 0)}
            onClick={() => onUpdate({ rotation: [0, 0, 0] })}
          />
        }
      >
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
            <NumberInput
              key={axis}
              label={axis}
              unit="°"
              precision={0}
              step={15}
              value={part.rotation[idx]}
              onChange={(v, l) => setRot(idx, v, l)}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
            <Tooltip key={axis} label={`Rotate 90° around ${axis}`} className="w-full">
              <button
                type="button"
                onClick={() => setRot(idx, part.rotation[idx] + 90)}
                className="w-full h-7 rounded-md text-[12px] text-white/50 hover:text-white/90 hover:bg-white/[0.06] flex items-center justify-center gap-1 cursor-default transition-colors"
              >
                <RotateCw className="w-3 h-3" />
                90°
              </button>
            </Tooltip>
          ))}
        </div>
      </Section>

      {!isImage && !comp && (
      <>
      {!hw && (
      <Section
        title="Shape"
        collapsible
        defaultOpen={hasDeform}
        actions={
          hasDeform ? (
            <IconButton
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              title="Reset shape"
              size="xs"
              onClick={() => onUpdate({ deformers: { taper: 0, bendDeg: 0, twistDeg: 0, roundness: 0 } })}
            />
          ) : undefined
        }
      >
        <Slider label="Round" min={0} max={1} step={0.05} defaultValue={0} value={d.roundness || 0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v, l) => setDeformer('roundness', v, l)} />
        <Slider label="Taper" min={-0.8} max={1} step={0.05} defaultValue={0} value={d.taper || 0} format={(v) => `${Math.round(v * 100)}%`} onChange={(v, l) => setDeformer('taper', v, l)} />
        <Slider label="Bend" min={-120} max={120} step={5} defaultValue={0} value={d.bendDeg || 0} format={(v) => `${Math.round(v)}°`} onChange={(v, l) => setDeformer('bendDeg', v, l)} />
        <Slider label="Twist" min={-180} max={180} step={5} defaultValue={0} value={d.twistDeg || 0} format={(v) => `${Math.round(v)}°`} onChange={(v, l) => setDeformer('twistDeg', v, l)} />
      </Section>
      )}

      <Section title="Appearance">
        <ColorField
          value={part.color}
          suggestions={props.parts.map((p) => p.color)}
          onChange={(color, live) => onUpdate({ color }, live)}
        />
        <Select
          aria-label="Material"
          value={part.mechanicalTag || '3D Printed PLA/PETG'}
          onChange={(e) => onUpdate({ mechanicalTag: e.target.value })}
          options={MATERIALS}
        />
      </Section>
      </>
      )}

      {partComments.length > 0 && <CommentsSection {...props} list={partComments} />}

      <Section title="Notes" collapsible defaultOpen={false}>
        <TextArea
          rows={3}
          value={part.note}
          onChange={(e) => onUpdate({ note: e.target.value }, true)}
          onBlur={(e) => onUpdate({ note: e.target.value }, false)}
        />
      </Section>

      {comp && (
        <Section title="Product" collapsible defaultOpen={false}>
          <div className="text-[12.5px] text-white/45 -mt-1">
            {comp.manufacturer} · {comp.mpn}
          </div>
          <SpecList
            rows={[
              ['Size', <SizeLine key="s" w={part.dimensions.width} h={part.dimensions.height} d={part.dimensions.depth} />],
              ...comp.specs,
            ]}
          />
          <p className="text-[12.5px] text-white/55 leading-relaxed">{comp.mounting}</p>
          <ModelSource c={comp} />
          <ComponentLinks c={comp} />
        </Section>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

/** Size / length pickers for a screw, nut, insert, standoff, pin or bearing */
const HardwareSection: React.FC<{
  spec: HardwareSpec;
  onChange: (spec: HardwareSpec, live?: Phase) => void;
  onAddClearanceHole: () => void;
}> = ({ spec, onChange, onAddClearanceHole }) => (
  <Section title={familyOf(spec.type).name}>
    <HardwareConfigurator spec={spec} onChange={onChange} />
    {spec.type !== 'standoff_ff' && (
      <Button size="sm" fullWidth onClick={onAddClearanceHole} title="Cutouts sized for this part, ready to subtract">
        Add Clearance Hole
      </Button>
    )}
  </Section>
);
