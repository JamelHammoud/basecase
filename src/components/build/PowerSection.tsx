import React from 'react';
import { NumberInput, Section, SegmentedControl } from '../../design-system';
import type { ProjectSettings, ScenePart, Tether } from '../../types/robotics';
import { suggestedTether } from '../../utils/powerSources';

interface PowerSectionProps {
  parts: ScenePart[];
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
}

type Source = 'battery' | 'tether';

const SOURCES = [
  { value: 'battery' as const, label: 'Battery', title: 'Runs from a battery on the robot' },
  { value: 'tether' as const, label: 'Tether', title: 'Runs on a cable from a wall or bench supply' },
];

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
  const tether = project.tether;
  const choose = (source: Source) =>
    onChangeProject({ tether: source === 'tether' ? (tether ?? suggestedTether(parts)) : undefined });

  return (
    <Section title="Power">
      <SegmentedControl<Source> options={SOURCES} value={tether ? 'tether' : 'battery'} onChange={choose} />
      {tether && <TetherFields tether={tether} onChange={(next) => onChangeProject({ tether: next })} />}
    </Section>
  );
};
