import React, { useMemo } from 'react';
import { Section } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import { prettyJointName, type Rig } from '../../utils/kinematics';
import { fmtTime, pct } from './format';

type SimStats = NonNullable<Simulation['stats']>;

type SimModel = NonNullable<Simulation['model']>;

const RobotResult: React.FC<{ result: SimStats['robots'][number]; model: SimModel }> = ({ result: r, model }) => {
  const robot = model.robots.find((x) => x.key === r.key);

  if (!robot?.floating) return null;

  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-white/85 truncate">{robot.name}</span>
        <span className={r.fellAt !== null ? 'text-[#f87171]' : 'text-white/70'}>
          {r.fellAt !== null ? `Fell at ${fmtTime(r.fellAt)}` : 'Standing'}
        </span>
      </div>
      <div className="text-[12px] text-white/45 tabular">
        Tilt {Math.round(r.tilt)}° · moved {(r.travelled * 100).toFixed(0)} cm
      </div>
    </div>
  );
};

const PeakTorque: React.FC<{
  worst: SimStats['joints'];
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
}> = ({ worst, rig, onSelectParts }) => {
  const linkOf = (jointId: string) => [...rig.ownerOf].filter(([, owner]) => owner === jointId).map(([p]) => p);

  return (
    <div className="mt-2">
      <div className="text-[12px] text-white/45 mb-1">Peak torque</div>
      {worst.map((j) => {
        const joint = rig.byId.get(j.id);

        return (
          <button
            key={j.id}
            type="button"
            className="w-full h-8 -mx-[6px] px-[6px] rounded-md flex items-center gap-2 text-left hover:bg-white/[0.05] cursor-default"
            onClick={() => onSelectParts(linkOf(j.id))}
          >
            <span className="flex-1 min-w-0 truncate text-[13px] text-white/80">
              {prettyJointName(joint?.name ?? j.id)}
            </span>
            {j.saturatedS > 0.05 && (
              <span className="text-[12px] text-white/40 tabular">{fmtTime(j.saturatedS)} at limit</span>
            )}
            <span
              className={`w-10 text-right text-[13px] tabular ${j.peak >= 0.98 ? 'text-[#f87171]' : 'text-white/70'}`}
            >
              {pct(j.peak)}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const ResultSection: React.FC<{
  stats: SimStats;
  model: SimModel;
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
}> = ({ stats, model, rig, onSelectParts }) => {
  const worst = useMemo(
    () =>
      stats.joints
        .filter((j) => j.peak > 0.05)
        .sort((a, b) => b.peak - a.peak || b.saturatedS - a.saturatedS)
        .slice(0, 6),
    [stats],
  );

  return (
    <Section title="Result">
      {stats.robots.map((r) => (
        <RobotResult key={r.key} result={r} model={model} />
      ))}
      {worst.length > 0 && <PeakTorque worst={worst} rig={rig} onSelectParts={onSelectParts} />}
    </Section>
  );
};
