import React from 'react';
import type { ScenePart } from '../../types/robotics';
import type { ComponentInfo } from '../../data/components';
import { ComponentLinks, DetailBlock, ModelOrigin, SpecRows } from '../PartDetails';
import {
  IconButton,
  MetaLine,
  NumberInput,
  Section,
  SegmentedControl,
  Slider,
  TextInput,
  BookmarkAddIcon,
  DeleteIcon,
  DuplicateIcon,
} from '../../design-system';
import { imageStance, resizedDimensions, type DimensionKey, type ImageStance } from './partMath';
import type { InspectorProps, Phase } from './types';
import { keyFor } from '../../app/shortcuts';

export interface PartSectionProps {
  part: ScenePart;
  onUpdate: InspectorProps['onUpdate'];
}

export const PartHeader: React.FC<
  PartSectionProps & Pick<InspectorProps, 'onDuplicate' | 'onSaveAsModel' | 'onDelete'>
> = ({ part, onUpdate, onDuplicate, onSaveAsModel, onDelete }) => (
  <div className="px-[12px] py-4 border-b border-white/[0.06] flex items-center gap-1">
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
      icon={<DuplicateIcon className="w-3.5 h-3.5" />}
      title="Duplicate"
      shortcut={keyFor('duplicate')}
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
      shortcut={keyFor('delete')}
      size="xs"
      variant="danger"
      onClick={onDelete}
    />
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
        { value: 'up', label: 'Stand Up' },
        { value: 'flat', label: 'Lay Flat' },
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
            aria-label="Wall thickness"
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
    <MetaLine items={[comp.manufacturer, comp.mpn]} className="text-[12.5px] text-white/50 -mt-1" />
    <SpecRows c={comp} d={part.dimensions} />
    <DetailBlock label="Mounting">{comp.mounting}</DetailBlock>
    <ModelOrigin c={comp} />
    <ComponentLinks c={comp} />
  </Section>
);
