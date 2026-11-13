import React from 'react';
import type { PolicyRecord } from '../../types/robotics';
import { fmtSteps } from './format';

export interface PolicyActions {
  onChoose: (id: string) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

export const PolicyList: React.FC<{ policies: PolicyRecord[]; actions: PolicyActions }> = ({ policies, actions }) => (
  <ul className="flex flex-col" data-testid="policy-list">
    {policies.map((p) => (
      <li
        key={p.id}
        className="h-8 flex items-center gap-2 -mx-[6px] px-[6px] rounded-lg hover:bg-white/[0.04]"
        onContextMenu={(e) => actions.onMenu(e, p.id)}
      >
        <button
          type="button"
          className="flex-1 min-w-0 h-8 text-left text-[13px] text-white/85 truncate cursor-default"
          onClick={() => actions.onChoose(p.id)}
        >
          {p.name}
        </button>
        <span className="text-[12px] text-white/50 tabular shrink-0">{fmtSteps(p.trainedSteps)} steps</span>
      </li>
    ))}
  </ul>
);
