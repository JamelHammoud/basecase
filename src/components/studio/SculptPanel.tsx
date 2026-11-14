import React from 'react';
import {
  Button,
  ChoiceGrid,
  Section,
  Slider,
  Switch,
  CapsuleIcon,
  CircleDotIcon,
  CylinderIcon,
  ShapeIcon,
  SparklesIcon,
} from '../../design-system';
import type { SculptBrushKind, SculptSettings } from '../../types/robotics';
import { percent } from '../../../electron/percent.mjs';

export type ClayPreset = 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule';

const BRUSH_CHOICES: Array<{ value: SculptBrushKind; label: string }> = [
  { value: 'inflate', label: 'Inflate' },
  { value: 'carve', label: 'Carve' },
  { value: 'grab', label: 'Grab' },
  { value: 'flatten', label: 'Flatten' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'pinch', label: 'Pinch' },
];

const CLAY_PRESETS = [
  { id: 'clay_sphere', label: 'Sphere', icon: <CircleDotIcon className="w-4 h-4" /> },
  { id: 'clay_box', label: 'Block', icon: <ShapeIcon className="w-4 h-4" /> },
  { id: 'clay_capsule', label: 'Capsule', icon: <CapsuleIcon className="w-4 h-4" /> },
  { id: 'clay_cylinder', label: 'Cylinder', icon: <CylinderIcon className="w-4 h-4" /> },
] as const;

const PRESET_TILE =
  'h-16 rounded-xl flex flex-col items-center justify-center gap-1.5 text-[12.5px] font-medium cursor-default transition-[background-color,color,transform] active:scale-[0.97] bg-white/[0.05] text-white/60 hover:bg-white/[0.09] hover:text-white';

export const SculptPanel: React.FC<{
  sculptSettings: SculptSettings;
  canSubdivide: boolean;
  onUpdateSculptSettings: (patch: Partial<SculptSettings>) => void;
  onAddClayPreset: (preset: ClayPreset) => void;
  onSubdivideSelectedClay: () => void;
}> = ({ sculptSettings, canSubdivide, onUpdateSculptSettings, onAddClayPreset, onSubdivideSelectedClay }) => (
  <>
    <Section title="Brush">
      <ChoiceGrid
        label="Brush"
        columns={3}
        options={BRUSH_CHOICES}
        value={sculptSettings.brush}
        onChange={(brush) => onUpdateSculptSettings({ brush })}
      />
      <Slider
        label="Size"
        min={3}
        max={50}
        value={sculptSettings.radiusMm}
        format={(v) => `${v} mm`}
        onChange={(v) => onUpdateSculptSettings({ radiusMm: v })}
      />
      <Slider
        label="Strength"
        min={0.1}
        max={1}
        step={0.05}
        value={sculptSettings.strength}
        format={percent}
        onChange={(v) => onUpdateSculptSettings({ strength: v })}
      />
      <Switch
        label="Mirror X"
        checked={sculptSettings.symmetryX}
        onChange={(v) => onUpdateSculptSettings({ symmetryX: v })}
      />
      <Switch
        label="Mirror Z"
        checked={sculptSettings.symmetryZ}
        onChange={(v) => onUpdateSculptSettings({ symmetryZ: v })}
      />
      {canSubdivide && (
        <Button size="md" fullWidth icon={<SparklesIcon className="w-4 h-4" />} onClick={onSubdivideSelectedClay}>
          Subdivide
        </Button>
      )}
    </Section>

    <Section title="Add clay">
      <div className="grid grid-cols-4 gap-1.5">
        {CLAY_PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => onAddClayPreset(p.id)} className={PRESET_TILE}>
            {p.icon}
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </Section>
  </>
);
