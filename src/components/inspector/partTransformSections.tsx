import React from 'react';
import { ArrowDownToLine, Crosshair, Layers, RotateCcw, RotateCw } from 'lucide-react';
import type { ScenePart } from '../../types/robotics';
import { ColorField, IconButton, NumberInput, Section, Select, Slider, Tooltip } from '../../design-system';
import { wrapDegrees } from './partMath';
import type { PartSectionProps } from './partSections';
import { MATERIALS, type InspectorProps, type Phase } from './types';

export const PositionSection: React.FC<
  PartSectionProps & Pick<InspectorProps, 'snapStepMm' | 'onDropToFloor' | 'onStack'>
> = ({ part, onUpdate, snapStepMm, onDropToFloor, onStack }) => {
  const setPos = (idx: number, v: number, live?: Phase) => {
    const next: [number, number, number] = [...part.position];

    next[idx] = v;
    onUpdate({ position: next }, live);
  };

  return (
    <Section
      title="Position"
      actions={
        <>
          <IconButton
            icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
            title="Drop to floor"
            shortcut="F"
            size="xs"
            onClick={onDropToFloor}
          />
          <IconButton
            icon={<Layers className="w-3.5 h-3.5" />}
            title="Stack on part below"
            shortcut="S"
            size="xs"
            onClick={onStack}
          />
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
  );
};

export const RotationSection: React.FC<PartSectionProps> = ({ part, onUpdate }) => {
  const setRot = (idx: number, v: number, live?: Phase) => {
    const next: [number, number, number] = [...part.rotation];

    next[idx] = wrapDegrees(v);
    onUpdate({ rotation: next }, live);
  };

  return (
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
  );
};

export const ShapeSection: React.FC<PartSectionProps> = ({ part, onUpdate }) => {
  const d = part.deformers || {};
  const hasDeform = !!d.taper || !!d.bendDeg || !!d.twistDeg || !!d.roundness;
  const setDeformer = (key: keyof NonNullable<ScenePart['deformers']>, v: number, live?: Phase) =>
    onUpdate({ deformers: { ...part.deformers, [key]: v } }, live);

  return (
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
      <Slider
        label="Round"
        min={0}
        max={1}
        step={0.05}
        defaultValue={0}
        value={d.roundness || 0}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v, l) => setDeformer('roundness', v, l)}
      />
      <Slider
        label="Taper"
        min={-0.8}
        max={1}
        step={0.05}
        defaultValue={0}
        value={d.taper || 0}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v, l) => setDeformer('taper', v, l)}
      />
      <Slider
        label="Bend"
        min={-120}
        max={120}
        step={5}
        defaultValue={0}
        value={d.bendDeg || 0}
        format={(v) => `${Math.round(v)}°`}
        onChange={(v, l) => setDeformer('bendDeg', v, l)}
      />
      <Slider
        label="Twist"
        min={-180}
        max={180}
        step={5}
        defaultValue={0}
        value={d.twistDeg || 0}
        format={(v) => `${Math.round(v)}°`}
        onChange={(v, l) => setDeformer('twistDeg', v, l)}
      />
    </Section>
  );
};

export const AppearanceSection: React.FC<PartSectionProps & { parts: ScenePart[] }> = ({ part, onUpdate, parts }) => (
  <Section title="Appearance">
    <ColorField
      value={part.color}
      suggestions={parts.map((p) => p.color)}
      onChange={(color, live) => onUpdate({ color }, live)}
    />
    <Select
      aria-label="Material"
      value={part.mechanicalTag || '3D Printed PLA/PETG'}
      onChange={(e) => onUpdate({ mechanicalTag: e.target.value })}
      options={MATERIALS}
    />
  </Section>
);
