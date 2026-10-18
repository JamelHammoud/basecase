import React from 'react';
import { BookmarkPlus, Copy, Trash2 } from 'lucide-react';
import type { ScenePart } from '../../types/robotics';
import type { ComponentInfo } from '../../data/components';
import { ComponentLinks, ModelSource, SizeLine, SpecList } from '../PartDetails';
import { IconButton, NumberInput, Section, SegmentedControl, Slider, TextInput } from '../../design-system';
import { imageStance, resizedDimensions, type DimensionKey, type ImageStance } from './partMath';
import type { InspectorProps, Phase } from './types';

export interface PartSectionProps {
  part: ScenePart;
  onUpdate: InspectorProps['onUpdate'];
}

export const PartHeader: React.FC<
  PartSectionProps & Pick<InspectorProps, 'onDuplicate' | 'onSaveAsModel' | 'onDelete'> & { isImage: boolean }
> = ({ part, onUpdate, onDuplicate, onSaveAsModel, onDelete, isImage }) => (
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
      <IconButton
        icon={<Copy className="w-3.5 h-3.5" />}
        title="Duplicate"
        shortcut="⌘D"
        size="xs"
        onClick={onDuplicate}
      />
      <IconButton
        icon={<BookmarkPlus className="w-3.5 h-3.5" />}
        title="Save to Library"
        size="xs"
        onClick={onSaveAsModel}
      />
      <IconButton
        icon={<Trash2 className="w-3.5 h-3.5" />}
        title="Delete"
        shortcut="⌫"
        size="xs"
        variant="danger"
        onClick={onDelete}
      />
    </div>
    {isImage && <p className="text-[12.5px] text-white/45">Reference image · not printed or exported</p>}
  </div>
);

export const ImageSection: React.FC<PartSectionProps> = ({ part, onUpdate }) => (
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
    <SegmentedControl<ImageStance>
      size="sm"
      value={imageStance(part.rotation)}
      onChange={(v) =>
        v === 'up'
          ? onUpdate({
              rotation: [0, part.rotation[1], 0],
              position: [part.position[0], part.dimensions.height / 2, part.position[2]],
            })
          : onUpdate({
              rotation: [-90, part.rotation[1], 0],
              position: [part.position[0], 0.2, part.position[2]],
            })
      }
      options={[
        { value: 'up', label: 'Stand Up', title: 'Upright, like a backdrop' },
        { value: 'flat', label: 'Lay Flat', title: 'On the floor, like a blueprint' },
      ]}
    />
  </Section>
);

export const SizeSection: React.FC<PartSectionProps & { isImage: boolean }> = ({ part, onUpdate, isImage }) => {
  const setDim = (key: DimensionKey, v: number, live?: Phase) =>
    onUpdate({ dimensions: resizedDimensions(part.dimensions, key, v, isImage) }, live);

  return (
    <Section title="Size">
      <div className={`grid ${isImage ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5`}>
        <NumberInput
          label="W"
          title="Width (X)"
          value={part.dimensions.width}
          min={1}
          max={2000}
          onChange={(v, l) => setDim('width', v, l)}
        />
        <NumberInput
          label="H"
          title="Height (Y)"
          value={part.dimensions.height}
          min={1}
          max={2000}
          onChange={(v, l) => setDim('height', v, l)}
        />
        {!isImage && (
          <NumberInput
            label="D"
            title="Depth (Z)"
            value={part.dimensions.depth}
            min={1}
            max={600}
            onChange={(v, l) => setDim('depth', v, l)}
          />
        )}
      </div>
      {part.dimensions.thickness !== undefined && (
        <div className="grid grid-cols-3 gap-1.5 items-center">
          <span className="col-span-2 text-[13px] text-white/50">Wall thickness</span>
          <NumberInput
            label="T"
            title="Wall thickness"
            value={part.dimensions.thickness}
            min={1}
            max={50}
            step={0.5}
            onChange={(v, l) => setDim('thickness', v, l)}
          />
        </div>
      )}
    </Section>
  );
};

export const ProductSection: React.FC<{ part: ScenePart; comp: ComponentInfo }> = ({ part, comp }) => (
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
);
