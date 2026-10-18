import React from 'react';
import { Section } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';

export const ModelSection: React.FC<{ model: NonNullable<Simulation['model']>; version: Simulation['version'] }> = ({
  model,
  version,
}) => {
  const estimated = model.joints.filter((j) => j.effortSource === 'estimate').length;

  return (
    <Section title="Model">
      <div className="text-[13px] text-white/70 tabular">
        {model.joints.length} {model.joints.length === 1 ? 'joint' : 'joints'} ·{' '}
        {Object.values(model.massKg)
          .reduce((s, v) => s + v, 0)
          .toFixed(2)}{' '}
        kg
      </div>
      {estimated > 0 && (
        <p className="mt-1 text-[12.5px] leading-snug text-white/45">
          Torque for {estimated} {estimated === 1 ? 'joint is' : 'joints is'} estimated from weight. Assign servos for
          exact limits.
        </p>
      )}
      {model.warnings.map((w) => (
        <p key={w} className="mt-1 text-[12.5px] leading-snug text-white/45">
          {w}
        </p>
      ))}
      {version && <p className="mt-1 text-[12px] text-white/35">MuJoCo {version}</p>}
    </Section>
  );
};
