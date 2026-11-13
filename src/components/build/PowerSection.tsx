import React from 'react';
import { NumberInput, Section } from '../../design-system';
import type { ProjectSettings, ScenePart, Tether } from '../../types/robotics';
import { sceneTether } from '../../utils/powerSources';

interface PowerSectionProps {
  parts: ScenePart[];
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
}

const TetherFields: React.FC<{ tether: Tether; onChange: (tether: Tether) => void }> = ({ tether, onChange }) => (
  <div className="grid grid-cols-2 gap-2">
    <NumberInput
      label="V"
      value={tether.volts}
      min={1}
      max={100}
      step={0.1}
      precision={1}
      unit=""
      title="Supply voltage"
      onChange={(volts, live) => !live && onChange({ ...tether, volts })}
    />
    <NumberInput
      label="A"
      value={tether.amps}
      min={0.5}
      max={200}
      step={0.5}
      precision={1}
      unit=""
      title="Supply current"
      onChange={(amps, live) => !live && onChange({ ...tether, amps })}
    />
  </div>
);

export const PowerSection: React.FC<PowerSectionProps> = ({ parts, project, onChangeProject }) => {
  const tether = sceneTether({ parts, project });

  if (!tether) return null;

  return (
    <Section title="Tether">
      <TetherFields tether={tether} onChange={(next) => onChangeProject({ tether: next })} />
    </Section>
  );
};
