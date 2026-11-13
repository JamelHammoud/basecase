import React from 'react';
import { MetaLine, Section } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';

export const ModelSection: React.FC<{ model: NonNullable<Simulation['model']> }> = ({ model }) => {
  const estimated = model.joints.filter((j) => j.effortSource === 'estimate').length;
  const guessed = model.joints.filter((j) => j.dynamics === 'estimated' && j.effortSource !== 'estimate').length;

  return (
    <Section title="Model">
      <MetaLine
        className="text-[13px] text-white/70 tabular"
        items={[
          `${model.joints.length} ${model.joints.length === 1 ? 'joint' : 'joints'}`,
          `${Object.values(model.massKg)
            .reduce((s, v) => s + v, 0)
            .toFixed(2)} kg`,
        ]}
      />
      {estimated > 0 && (
        <p className="mt-1 text-[12.5px] leading-snug text-white/50">
          Torque for {estimated} {estimated === 1 ? 'joint is' : 'joints is'} estimated from weight. Assign servos for
          exact limits.
        </p>
      )}
      {guessed > 0 && (
        <p className="mt-1 text-[12.5px] leading-snug text-white/50">
          Servo response for {guessed} {guessed === 1 ? 'joint is' : 'joints is'} estimated.
        </p>
      )}
      {model.warnings.map((w) => (
        <p key={w} className="mt-1 text-[12.5px] leading-snug text-white/50">
          {w}
        </p>
      ))}
    </Section>
  );
};
