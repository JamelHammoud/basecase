import React from 'react';
import { Box, CircleDot, Cylinder, Pill, Sparkles } from 'lucide-react';
import { Button, Section, Slider, Switch, Tooltip } from '../../design-system';
import type { SculptBrushKind, SculptSettings } from '../../types/robotics';

export type ClayPreset = 'clay_sphere' | 'clay_box' | 'clay_cylinder' | 'clay_capsule';

const BRUSH_OPTIONS: Array<{
  id: SculptBrushKind;
  label: string;
  desc: string;
}> = [
  { id: 'inflate', label: 'Inflate', desc: 'Build volume outward' },
  { id: 'carve', label: 'Carve', desc: 'Push the surface inward' },
  { id: 'grab', label: 'Grab', desc: 'Pull the shape' },
  { id: 'flatten', label: 'Flatten', desc: 'Make a flat face' },
  { id: 'smooth', label: 'Smooth', desc: 'Relax the surface' },
  { id: 'pinch', label: 'Pinch', desc: 'Sharpen a crease' },
];

const CLAY_PRESETS = [
  { id: 'clay_sphere', label: 'Sphere', icon: <CircleDot className="w-4 h-4" /> },
  { id: 'clay_box', label: 'Block', icon: <Box className="w-4 h-4" /> },
  { id: 'clay_capsule', label: 'Capsule', icon: <Pill className="w-4 h-4" /> },
  { id: 'clay_cylinder', label: 'Cylinder', icon: <Cylinder className="w-4 h-4" /> },
] as const;

const PRESET_TILE =
  'h-16 rounded-xl flex flex-col items-center justify-center gap-1.5 text-[12.5px] font-medium cursor-default transition-[background-color,color,transform] active:scale-[0.97] bg-white/[0.05] text-white/75 hover:bg-white/[0.09] hover:text-white';

export const SculptPanel: React.FC<{
  sculptSettings: SculptSettings;
  hasSelection: boolean;
  onUpdateSculptSettings: (patch: Partial<SculptSettings>) => void;
  onAddClayPreset: (preset: ClayPreset) => void;
  onSubdivideSelectedClay: () => void;
}> = ({ sculptSettings, hasSelection, onUpdateSculptSettings, onAddClayPreset, onSubdivideSelectedClay }) => (
  <>
    <Section title="Brush">
      <div className="grid grid-cols-3 gap-1.5">
        {BRUSH_OPTIONS.map((b) => (
          <Tooltip key={b.id} label={b.desc} className="w-full">
            <button
              type="button"
              onClick={() => onUpdateSculptSettings({ brush: b.id })}
              className={`w-full h-9 rounded-lg text-[13px] font-medium cursor-default transition-colors ${
                sculptSettings.brush === b.id
                  ? 'bg-[#0d99ff] text-white'
                  : 'bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white'
              }`}
            >
              {b.label}
            </button>
          </Tooltip>
        ))}
      </div>
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
        format={(v) => `${Math.round(v * 100)}%`}
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
      <p className="text-[12.5px] text-white/45">Drag on a part to sculpt. Hold ⌥ to invert.</p>
      {hasSelection && (
        <Button size="md" fullWidth icon={<Sparkles className="w-4 h-4" />} onClick={onSubdivideSelectedClay}>
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
