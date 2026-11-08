import React, { useState } from 'react';
import { ContextMenu, EmptyState, PlusIcon, type ContextMenuEntry, CasesIcon } from '../../design-system';
import type { Cases } from '../../workspace/useCases';
import { CaseRow } from './CaseRow';

export interface CasesPanelProps {
  cases: Cases;
  onOpen: () => void;
}

export const CasesPanel: React.FC<CasesPanelProps> = ({ cases, onOpen }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  if (!cases.hasRobot)
    return (
      <EmptyState
        icon={<CasesIcon className="w-5 h-5" />}
        title="Add a robot to try a Case"
        description="Cases are worlds with a goal that a robot drives through."
      />
    );

  const open = (id: string) => {
    cases.open(id);
    onOpen();
  };
  const startFrom = (id: string) => {
    if (cases.addTemplate(id)) onOpen();
  };
  const caseMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{ label: 'Delete', tone: 'danger', onSelect: () => cases.remove(id) }],
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pb-3" data-testid="cases-panel">
      {cases.cases.length > 0 && (
        <div className="mb-3">
          <div className="px-[4px] h-8 flex items-center text-[12px] font-medium text-white/45">In this scene</div>
          {cases.cases.map((c) => (
            <CaseRow
              key={c.id}
              name={c.name}
              brief={c.brief}
              selected={cases.active?.id === c.id}
              onClick={() => open(c.id)}
              onContextMenu={(e) => caseMenu(e, c.id)}
            />
          ))}
        </div>
      )}
      <div className="px-[4px] h-8 flex items-center text-[12px] font-medium text-white/45">Start from</div>
      {cases.templates.map((t) => (
        <CaseRow
          key={t.id}
          name={t.name}
          brief={t.refusal ?? t.brief}
          disabled={!!t.refusal}
          icon={<PlusIcon className="w-4 h-4" />}
          onClick={() => startFrom(t.id)}
        />
      ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
