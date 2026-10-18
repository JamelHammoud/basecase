import React from 'react';
import { NumberInput, Section, Select } from '../../design-system';
import type { PrintMaterial, ProjectSettings } from '../../types/robotics';
import { type PrintReport, fmtSize } from '../../utils/printReport';
import { hm, plural } from './format';
import { Notice } from './Notice';

type PrintedPart = PrintReport['parts'][number];

interface PrintedSectionProps {
  report: PrintReport | null;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  onSelectParts: (ids: string[]) => void;
}

const MATERIALS: Array<{ value: PrintMaterial; label: string }> = [
  { value: 'PLA', label: 'PLA' },
  { value: 'PETG', label: 'PETG' },
  { value: 'ABS', label: 'ABS' },
  { value: 'ASA', label: 'ASA' },
];

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[13px] text-white/60">{label}</span>
    <div className="w-[112px] shrink-0">{children}</div>
  </div>
);

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
        <div className="text-[12px] text-white/40 truncate tabular-nums">
          {fmtSize(p.check.size)} mm · {hm(p.hours)}
          {p.check.fits ? ` · Plate ${p.plate}` : ''}
          {p.material !== material ? ` · ${p.material}` : ''}
        </div>
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

const PrintedList: React.FC<{
  report: PrintReport;
  project: ProjectSettings;
  onSelectParts: (ids: string[]) => void;
}> = ({ report, project, onSelectParts }) => {
  const { parts, totals: t } = report;
  const plates = Object.values(report.plates).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <>
      <div className="text-[12.5px] text-white/45 tabular-nums">
        {parts.length} {plural(parts.length, 'part', 'parts')} ·{' '}
        {Math.round(t.grams + t.supportG).toLocaleString('en-US')} g · {hm(t.hours)} · {plates}{' '}
        {plural(plates, 'plate', 'plates')}
      </div>
      {t.failing > 0 && (
        <Notice
          tone="amber"
          text={`Fix ${t.failing} ${plural(t.failing, 'part', 'parts')} before printing`}
          onClick={() => onSelectParts(parts.filter((p) => p.issues.length).map((p) => p.id))}
        />
      )}
      <ul className="-mx-[7px]">
        {parts.map((p) => (
          <PrintedRow key={p.id} part={p} material={project.material} onSelectParts={onSelectParts} />
        ))}
      </ul>
      <p className="text-[12px] text-white/40">
        Estimate for a Bambu P1S: 2 walls, 4 top and bottom layers, {project.infillPct}% infill, best flat
        orientation. Slice to confirm.
      </p>
    </>
  );
};

export const PrintedSection: React.FC<PrintedSectionProps> = ({ report, project, onChangeProject, onSelectParts }) => (
  <Section title="Printed parts">
    <Row label="Material">
      <Select
        value={project.material}
        options={MATERIALS}
        aria-label="Material"
        onChange={(e) => onChangeProject({ material: e.target.value as PrintMaterial })}
      />
    </Row>
    <Row label="Infill">
      <NumberInput
        value={project.infillPct}
        min={5}
        max={100}
        step={5}
        precision={0}
        unit="%"
        title="Infill"
        onChange={(v, live) => !live && onChangeProject({ infillPct: v })}
      />
    </Row>
    {report && report.parts.length > 0 && (
      <PrintedList report={report} project={project} onSelectParts={onSelectParts} />
    )}
  </Section>
);
