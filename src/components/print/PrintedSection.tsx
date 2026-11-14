import React from 'react';
import { MetaLine, Section } from '../../design-system';
import type { PrintMaterial, ProjectSettings } from '../../types/robotics';
import type { PrintReport } from '../../utils/printReport';
import { SizeLine } from '../PartDetails';
import { duration } from '../../utils/duration';
import { weight } from '../../utils/weight';

type PrintedPart = PrintReport['parts'][number];

interface PrintedSectionProps {
  report: PrintReport | null;
  project: ProjectSettings;
  notes: Record<string, string>;
  onSelectParts: (ids: string[]) => void;
}

const issuesFirst = (parts: PrintedPart[], notes: Record<string, string>) => {
  const flagged = (p: PrintedPart) => Number(p.issues.length > 0 || p.id in notes);

  return [...parts].sort((a, b) => flagged(b) - flagged(a));
};

interface PrintedRowProps {
  part: PrintedPart;
  material: PrintMaterial;
  note?: string;
  onSelectParts: (ids: string[]) => void;
}

const PrintedRow: React.FC<PrintedRowProps> = ({ part: p, material, note, onSelectParts }) => (
  <li>
    <button
      type="button"
      onClick={() => onSelectParts([p.id])}
      className="w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg hover:bg-white/[0.04] text-left cursor-default"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/90 truncate">
          {p.copies > 1 && <span className="text-white/50 tabular-nums">{p.copies} × </span>}
          {p.name}
        </div>
        <MetaLine
          className="text-[12px] text-white/50 tabular-nums"
          items={[
            <SizeLine mm={p.check.size} />,
            duration(p.hours * 3600, 'min'),
            p.check.fits && `Plate ${p.plate}`,
            p.material !== material && p.material,
          ]}
        />
        {[...p.issues, ...(note ? [note] : [])].map((issue) => (
          <div key={issue} className={`text-[12px] mt-0.5 ${p.check.fits ? 'text-amber-400' : 'text-red-400'}`}>
            {issue}
          </div>
        ))}
      </div>
      <span className="text-[12px] text-white/50 tabular-nums pt-[1px]">{weight(p.grams + p.supportG)}</span>
    </button>
  </li>
);

export const PrintedSection: React.FC<PrintedSectionProps> = ({ report, project, notes, onSelectParts }) =>
  report && report.parts.length > 0 ? (
    <Section title="Parts" summary={report.parts.length} collapsible defaultOpen={false}>
      <ul className="-mx-[7px]">
        {issuesFirst(report.parts, notes).map((p) => (
          <PrintedRow
            key={p.id}
            part={p}
            material={project.material}
            note={notes[p.id]}
            onSelectParts={onSelectParts}
          />
        ))}
      </ul>
    </Section>
  ) : null;
