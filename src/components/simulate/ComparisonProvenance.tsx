import { useState } from 'react';
import { DisclosureRow } from '../../design-system';
import { originLabel } from '../../cases/tryFile';
import type { SourceInfo } from '../../cases/comparison/comparisonJobs';

export function ComparisonProvenance({ source, index }: { source: SourceInfo; index: number }) {
  const [open, setOpen] = useState(false);
  const { stored } = source;
  const name = originLabel(stored.origin) ?? stored.case?.name ?? stored.robot.name;
  const rows = [
    ['Try', stored.id],
    ['Robot', stored.robot.name],
    ['Model', stored.robot.modelHash],
    ['Policy', stored.policy],
    ['Started', stored.startedAt],
    ['Recording hash', source.hash],
    ['File hash', stored.origin?.kind === 'file' ? stored.origin.hash : stored.origin?.revision],
  ].filter((row) => !!row[1]);

  return (
    <div className="sticky top-0 z-10 bg-[#262626]">
      <DisclosureRow open={open} onToggle={() => setOpen(!open)}>
        <span className={`text-[13px] shrink-0 ${index === 0 ? 'text-[#0d99ff]' : 'text-white/90'}`}>
          {index === 0 ? 'A' : 'B'}
        </span>
        <span className="text-[13px] text-white/90 truncate flex-1">{name}</span>
      </DisclosureRow>
      {open && (
        <dl className="px-2 py-2 flex flex-col gap-2 text-[12px] text-white/60">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="shrink-0">{label}</dt>
              <dd className="min-w-0 break-all text-white/90">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
