import React from 'react';
import { Badge, IconButton, StopIcon } from '../../design-system';
import type { Training } from '../../sim/useTraining';
import type { PolicyRecord } from '../../types/robotics';
import { fmtSteps, pct, trainingLine } from './format';
import { ProgressBar } from './ProgressBar';

const share = (training: Training) => {
  const p = training.progress;

  return p && p.budgetS > 0 ? p.elapsedS / p.budgetS : null;
};

const Retraining: React.FC<{ training: Training }> = ({ training }) => {
  if (training.status === 'error') return <div className="text-[12px] text-white/50">{training.error}</div>;

  const done = share(training);
  const line = training.message ? trainingLine(training.message, done) : done !== null && pct(done);

  return (
    <>
      {line && <div className="text-[12px] text-white/50 tabular truncate">{line}</div>}
      {done !== null && <ProgressBar share={done} />}
    </>
  );
};

export interface PolicyActions {
  onChoose: (id: string) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

const PolicyRow: React.FC<PolicyActions & { policy: PolicyRecord; training: Training }> = ({
  policy,
  training,
  onChoose,
  onMenu,
}) => {
  const retraining = training.retraining === policy.id;
  const running = retraining && training.status !== 'error';
  const stale = training.isStale(policy);

  return (
    <li
      className="min-h-[32px] flex items-center gap-2 -mx-[6px] px-[6px] rounded-lg hover:bg-white/[0.04]"
      data-policy={policy.id}
      data-stale={stale}
      data-retraining={running}
      onContextMenu={(e) => onMenu(e, policy.id)}
    >
      <div className="flex-1 min-w-0">
        <button
          type="button"
          className="w-full h-[32px] text-left text-[13px] text-white/85 truncate cursor-default"
          onClick={() => onChoose(policy.id)}
        >
          {policy.name}
        </button>
        {retraining && <Retraining training={training} />}
      </div>
      {stale && !running && <Badge variant="amber">Out of date</Badge>}
      {running ? (
        <IconButton
          icon={<StopIcon className="w-3.5 h-3.5" />}
          title="Stop training"
          size="xs"
          onClick={training.stop}
        />
      ) : (
        <span className="text-[12px] text-white/50 tabular shrink-0">{fmtSteps(policy.trainedSteps)} steps</span>
      )}
    </li>
  );
};

export const PolicyList: React.FC<{ policies: PolicyRecord[]; training: Training; actions: PolicyActions }> = ({
  policies,
  training,
  actions,
}) => (
  <ul className="flex flex-col" data-testid="policy-list">
    {policies.map((p) => (
      <PolicyRow key={p.id} policy={p} training={training} {...actions} />
    ))}
  </ul>
);
