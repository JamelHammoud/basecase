import React from 'react';
import { IconButton, Section, DeleteIcon } from '../../design-system';
import type { PolicyRecord } from '../../types/robotics';
import { fmtSteps } from './format';

export const PoliciesSection: React.FC<{
  policies: PolicyRecord[];
  onChoose: (id: string) => void;
  onDelete: (id: string) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}> = ({ policies, onChoose, onDelete, onMenu }) => (
  <Section title="Policies">
    {policies.map((p) => (
      <div
        key={p.id}
        className="h-9 flex items-center gap-2 -mx-[6px] px-[6px] rounded-md hover:bg-white/[0.04]"
        onContextMenu={(e) => onMenu(e, p.id)}
      >
        <button
          type="button"
          className="flex-1 min-w-0 text-left text-[13px] text-white/85 truncate cursor-default"
          onClick={() => onChoose(p.id)}
        >
          {p.name}
        </button>
        <span className="text-[12px] text-white/40 tabular shrink-0">{fmtSteps(p.trainedSteps)} steps</span>
        <IconButton
          icon={<DeleteIcon className="w-4 h-4" />}
          title="Delete policy"
          size="xs"
          variant="ghost"
          onClick={() => onDelete(p.id)}
        />
      </div>
    ))}
  </Section>
);
