import React, { useState } from 'react';
import { Button, ContextMenu, PlusIcon, type ContextMenuEntry } from '../../design-system';
import type { Cases } from '../../workspace/useCases';
import { CaseRow } from './CaseRow';
import { NewCaseCard } from './NewCaseCard';

export interface CasesPanelProps {
  cases: Cases;
  onOpen: () => void;
  onBrowseRobots: () => void;
  onDescribe?: () => void;
}

const Heading: React.FC<{ children: string }> = ({ children }) => (
  <div className="px-[4px] h-8 flex items-center text-[12px] font-medium text-white/50">{children}</div>
);

function NewCase({ cases, onOpen, onDescribe }: Omit<CasesPanelProps, 'onBrowseRobots'>) {
  const { builder } = cases;

  return (
    <div className="mb-3 flex flex-col gap-1">
      {builder.open && <NewCaseCard key={builder.roomKey} builder={builder} onCreated={onOpen} />}
      {!builder.open && builder.goals.length > 0 && (
        <Button
          variant="primary"
          size="md"
          fullWidth
          icon={<PlusIcon className="w-4 h-4" />}
          title="Pick a world and a goal"
          onClick={builder.start}
        >
          New Case
        </Button>
      )}
      {onDescribe && (
        <Button variant="ghost" size="sm" fullWidth title="Describe a Case in words" onClick={onDescribe}>
          Ask the Agent
        </Button>
      )}
    </div>
  );
}

export const CasesPanel: React.FC<CasesPanelProps> = ({ cases, onOpen, onDescribe }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

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
      <NewCase cases={cases} onOpen={onOpen} onDescribe={onDescribe} />
      {cases.cases.length > 0 && (
        <div className="mb-3">
          <Heading>In this scene</Heading>
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
      {cases.examples.length > 0 && (
        <>
          <Heading>Examples</Heading>
          {cases.examples.map((t) => (
            <CaseRow
              key={t.id}
              name={t.name}
              brief={t.brief}
              icon={<PlusIcon className="w-4 h-4" />}
              onClick={() => startFrom(t.id)}
            />
          ))}
        </>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
