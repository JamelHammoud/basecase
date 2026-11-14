import React from 'react';
import type { ComparedRobot } from '../../cases/caseCompare';
import { Tooltip } from '../../design-system';
import { weight } from '../../utils/weight';
import { useMoney } from '../../utils/useMoney';
import type { CaseCompare } from '../../workspace/useCaseCompare';
import { PendingRow } from './PendingRow';

interface RowProps {
  robot: ComparedRobot;
  better: boolean;
  onShow: (() => void) | null;
}

const CompareRow: React.FC<RowProps> = ({ robot, better, onShow }) => {
  const money = useMoney();
  const { runs } = robot;
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px]">
        <span className="flex-1 min-w-0 truncate text-white/85">{robot.name}</span>
        <Tooltip label={runs.refusal} disabled={!runs.refusal} className="min-w-0">
          <span
            className={`min-w-0 truncate tabular ${better ? 'text-[#0d99ff]' : 'text-white/70'}`}
            data-testid="compare-passes"
          >
            {runs.refusal ?? `${runs.passes} of ${runs.runs}`}
          </span>
        </Tooltip>
      </span>
      <span className="flex gap-3 text-[12px] text-white/50 tabular">
        <span>{money.format(robot.costUsd)}</span>
        <span>{weight(robot.massG)}</span>
      </span>
    </>
  );
  const shape = 'w-full -mx-1.5 px-1.5 py-1.5 flex flex-col gap-0.5 rounded-[8px] text-left';

  if (!onShow)
    return (
      <div className={shape} data-testid="compare-row" data-better={better}>
        {body}
      </div>
    );

  return (
    <button
      type="button"
      className={`${shape} cursor-default hover:bg-white/[0.05] transition-colors`}
      onClick={onShow}
      data-testid="compare-row"
      data-better={better}
    >
      {body}
    </button>
  );
};

export const CompareRows: React.FC<{ compare: CaseCompare }> = ({ compare }) => {
  const { comparison } = compare;

  if (!comparison && compare.running)
    return (
      <div className="flex flex-col" data-testid="case-compare">
        <PendingRow />
        <PendingRow />
      </div>
    );

  if (!comparison) return null;

  const [own, ...others] = comparison.robots;

  return (
    <div className="flex flex-col" data-testid="case-compare">
      {[own, ...others].map((robot) => (
        <CompareRow
          key={robot.tabId}
          robot={robot}
          better={comparison.better === robot.tabId}
          onShow={robot === own ? null : () => compare.show(robot.tabId)}
        />
      ))}
    </div>
  );
};
