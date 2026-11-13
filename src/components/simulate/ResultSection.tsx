import React, { useMemo, useState } from 'react';
import { Badge, ContextMenu, MetaLine, Section, type ContextMenuEntry } from '../../design-system';
import type { FaultKind } from '../../sim/faults';
import type { Simulation } from '../../sim/useSimulation';
import { prettyJointName, type Rig } from '../../utils/kinematics';
import { FAULT_LABEL, faultSubmenu } from './faultMenu';
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
      <MetaLine
        className="text-[12px] text-white/50 tabular"
        items={[`Tilt ${Math.round(r.tilt)}°`, `Moved ${(r.travelled * 100).toFixed(0)} cm`]}
      />
    </div>
  );
};

type OnFault = (jointId: string, kind: FaultKind | null) => void;

const PeakTorque: React.FC<{
  worst: SimStats['joints'];
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
  onFault: OnFault;
}> = ({ worst, rig, onSelectParts, onFault }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const linkOf = (jointId: string) => [...rig.ownerOf].filter(([, owner]) => owner === jointId).map(([p]) => p);
  const openMenu = (e: React.MouseEvent, j: SimStats['joints'][number], name: string) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ heading: name }, faultSubmenu(j.fault, (kind) => onFault(j.id, kind))],
    });
  };

  return (
    <div className="mt-2">
      <div className="text-[12px] text-white/50 mb-1">Peak torque</div>
      {worst.map((j) => {
        const name = prettyJointName(rig.byId.get(j.id)?.name ?? j.id);

        return (
          <button
            key={j.id}
            type="button"
            data-testid="peak-row"
            className="w-full h-8 -mx-[6px] px-[6px] rounded-md flex items-center gap-2 text-left hover:bg-white/[0.05] cursor-default"
            onClick={() => onSelectParts(linkOf(j.id))}
            onContextMenu={(e) => openMenu(e, j, name)}
          >
            <span className="flex-1 min-w-0 truncate text-[13px] text-white/80">{name}</span>
            {j.fault && <Badge variant="amber">{FAULT_LABEL[j.fault]}</Badge>}
            {j.saturatedS > 0.05 && (
              <span className="text-[12px] text-white/50 tabular">{fmtTime(j.saturatedS)} at limit</span>
            )}
            <span
              className={`w-10 text-right text-[13px] tabular ${j.peak >= 0.98 ? 'text-[#f87171]' : 'text-white/70'}`}
            >
              {pct(j.peak)}
            </span>
          </button>
        );
      })}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};

const hardestFirst = (joints: SimStats['joints']) =>
  joints
    .filter((j) => j.peak > 0.05 || j.fault)
    .sort((a, b) => Number(!!b.fault) - Number(!!a.fault) || b.peak - a.peak || b.saturatedS - a.saturatedS)
    .slice(0, Math.max(6, joints.filter((j) => j.fault).length));

export const ResultSection: React.FC<{
  stats: SimStats;
  model: SimModel;
  rig: Rig;
  onSelectParts: (ids: string[]) => void;
  onFault: OnFault;
}> = ({ stats, model, rig, onSelectParts, onFault }) => {
  const worst = useMemo(() => hardestFirst(stats.joints), [stats]);

  return (
    <Section title="Result">
      {stats.robots.map((r) => (
        <RobotResult key={r.key} result={r} model={model} />
      ))}
      {worst.length > 0 && <PeakTorque worst={worst} rig={rig} onSelectParts={onSelectParts} onFault={onFault} />}
    </Section>
  );
};
