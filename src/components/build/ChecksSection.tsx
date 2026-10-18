import React, { useState } from 'react';
import { CircleCheck, CircleMinus, CircleX, TriangleAlert } from 'lucide-react';
import { Button, Section } from '../../design-system';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { ENGINEERING_CHECKS } from '../../utils/engineering';
import type { CheckRow, EngineeringReport } from '../../utils/engineering';

interface ChecksSectionProps {
  parts: ScenePart[];
  project: ProjectSettings;
  onRun: () => EngineeringReport;
  onSelectParts: (ids: string[]) => void;
}

interface RunResult {
  r: EngineeringReport;
  parts: ScenePart[];
  project: ProjectSettings;
}

const STATUS_ICON: Record<CheckRow['status'], React.ReactNode> = {
  pass: <CircleCheck className="w-4 h-4 text-emerald-400" />,
  warn: <TriangleAlert className="w-4 h-4 text-amber-400" />,
  fail: <CircleX className="w-4 h-4 text-red-400" />,
  'not run': <CircleMinus className="w-4 h-4 text-white/35" />,
};

const NOT_RUN: CheckRow[] = ENGINEERING_CHECKS.map((check) => ({ check, status: 'not run', detail: '' }));

function runLabel(running: boolean, ran: boolean) {
  if (running) return 'Checking…';

  return ran ? 'Run Again' : 'Run Checks';
}

const CheckItem: React.FC<{ row: CheckRow; ran: boolean; onSelectParts: (ids: string[]) => void }> = ({
  row,
  ran,
  onSelectParts,
}) => (
  <li>
    <button
      type="button"
      onClick={() => row.ids?.length && onSelectParts(row.ids)}
      className={`w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg text-left cursor-default ${ran ? 'hover:bg-white/[0.04]' : ''}`}
    >
      <span className="h-[18px] flex items-center shrink-0">{STATUS_ICON[row.status]}</span>
      <span className="min-w-0">
        <span className={`block text-[13px] leading-[18px] ${ran ? 'text-white/90' : 'text-white/60'}`}>
          {row.check}
        </span>
        {row.detail && <span className="block text-[12px] text-white/45">{row.detail}</span>}
      </span>
    </button>
    {!!row.items?.length && (
      <ul className="pl-[24px] pb-1">
        {row.items.map((item, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => item.ids?.length && onSelectParts(item.ids)}
              className="w-full py-1 px-[7px] rounded-md text-left text-[12px] leading-[16px] text-white/60 hover:bg-white/[0.04] hover:text-white/85 cursor-default"
            >
              {item.text}
            </button>
          </li>
        ))}
      </ul>
    )}
  </li>
);

export const ChecksSection: React.FC<ChecksSectionProps> = ({ parts, project, onRun, onSelectParts }) => {
  const [report, setReport] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const stale = report && (report.parts !== parts || report.project !== project);
  const run = () => {
    setRunning(true);
    window.setTimeout(() => {
      try {
        setReport({ r: onRun(), parts, project });
      } finally {
        setRunning(false);
      }
    }, 30);
  };
  const rows = report ? report.r.rows : NOT_RUN;

  return (
    <Section
      title="Checks"
      actions={
        <Button variant="secondary" size="xs" onClick={run} disabled={running || !parts.length}>
          {runLabel(running, !!report)}
        </Button>
      }
    >
      {stale && <p className="text-[12.5px] text-white/45">The model changed since this run</p>}
      <ul className="-mx-[7px]">
        {rows.map((row) => (
          <CheckItem key={row.check} row={row} ran={!!report} onSelectParts={onSelectParts} />
        ))}
      </ul>
    </Section>
  );
};
