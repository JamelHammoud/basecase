import React from 'react';
import { MetaLine, Section } from '../../design-system';
import type { PrintMaterial, ProjectSettings } from '../../types/robotics';
import { type PrintReport, fmtSize } from '../../utils/printReport';
import { hm } from './format';

type PrintedPart = PrintReport['parts'][number];

interface PrintedSectionProps {
  report: PrintReport | null;
  project: ProjectSettings;
  onSelectParts: (ids: string[]) => void;
}

const PrintedRow: React.FC<{ part: PrintedPart; material: PrintMaterial; onSelectParts: (ids: string[]) => void }> = ({
  part: p,
  material,
  onSelectParts,
}) => (
  <li>
    <button
      type="button"
      onClick={() => onSelectParts([p.id])}
      className="w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg hover:bg-white/[0.04] text-left cursor-default"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/90 truncate">{p.name}</div>
        <MetaLine
          className="text-[12px] text-white/40 tabular-nums"
          items={[
            `${fmtSize(p.check.size)} mm`,
            hm(p.hours),
            p.check.fits && `Plate ${p.plate}`,
            p.material !== material && p.material,
            p.copies > 1 && `${p.copies} copies`,
          ]}
        />
        {p.issues.map((issue) => (
          <div key={issue} className={`text-[12px] mt-0.5 ${p.check.fits ? 'text-amber-400' : 'text-red-400'}`}>
            {issue}
          </div>
        ))}
      </div>
      <span className="text-[12px] text-white/40 tabular-nums pt-[1px]">{Math.round(p.grams + p.supportG)} g</span>
    </button>
  </li>
);

export const PrintedSection: React.FC<PrintedSectionProps> = ({ report, project, onSelectParts }) =>
  report && report.parts.length > 0 ? (
    <Section title="Printed parts" collapsible defaultOpen={false}>
      <ul className="-mx-[7px]">
        {report.parts.map((p) => (
          <PrintedRow key={p.id} part={p} material={project.material} onSelectParts={onSelectParts} />
        ))}
      </ul>
    </Section>
  ) : null;
