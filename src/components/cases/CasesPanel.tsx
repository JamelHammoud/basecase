import React, { useState } from 'react';
import {
  Button,
  CompareIcon,
  ContextMenu,
  DownloadIcon,
  MenuItem,
  PlusIcon,
  deleteEntry,
  renameEntry,
  type ContextMenuEntry,
} from '../../design-system';
import type { Cases } from '../../workspace/useCases';
import type { CaseCompare } from '../../workspace/useCaseCompare';
import { CaseRow } from './CaseRow';
import { NewCaseCard } from './NewCaseCard';

export interface CasesPanelProps {
  cases: Cases;
  compare: Pick<CaseCompare, 'choices' | 'start'>;
  onOpen: () => void;
  onShowRobots: () => void;
  onDescribe?: () => void;
}

function NewCase({ cases, onOpen, onDescribe }: Omit<CasesPanelProps, 'onShowRobots' | 'compare'>) {
  const { builder } = cases;

  return (
    <div className="mb-3 flex flex-col gap-1">
      {builder.open && <NewCaseCard key={builder.roomKey} builder={builder} onCreated={onOpen} />}
      {!builder.open && builder.goals.length > 0 && (
        <Button variant="primary" size="md" fullWidth icon={<PlusIcon className="w-4 h-4" />} onClick={builder.start}>
          New Case
        </Button>
      )}
      {onDescribe && (
        <Button variant="ghost" size="sm" fullWidth onClick={onDescribe}>
          Ask the Agent
        </Button>
      )}
    </div>
  );
}

function compareEntry(compare: CasesPanelProps['compare'], onOpen: () => void): ContextMenuEntry[] {
  if (!compare.choices.length) return [];

  return [
    {
      label: 'Compare With',
      icon: <CompareIcon />,
      submenuWidth: 220,
      submenu: (close) =>
        compare.choices.map((choice) => (
          <MenuItem
            key={choice.tabId}
            label={choice.name}
            onSelect={() => {
              compare.start(choice.tabId);
              onOpen();
              close();
            }}
          />
        )),
    },
    { divider: true },
  ];
}

function matEntry({ mat }: Cases): ContextMenuEntry[] {
  if (!mat.available) return [];

  return [{ label: 'Export Case Mat', icon: <DownloadIcon />, onSelect: mat.exportMat }, { divider: true }];
}

export const CasesPanel: React.FC<CasesPanelProps> = ({ cases, compare, onOpen, onDescribe }) => {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  const open = (id: string) => {
    cases.open(id);
    onOpen();
  };
  const caseMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        renameEntry(() => cases.naming.start(id)),
        { divider: true },
        ...(cases.active?.id === id ? [...compareEntry(compare, onOpen), ...matEntry(cases)] : []),
        deleteEntry(() => cases.remove(id)),
      ],
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pb-3" data-testid="cases-panel">
      <NewCase cases={cases} onOpen={onOpen} onDescribe={onDescribe} />
      {cases.cases.length > 0 && (
        <div className="mb-3">
          {cases.cases.map((c) => (
            <CaseRow
              key={c.id}
              name={c.name}
              brief={c.brief}
              selected={cases.active?.id === c.id}
              renaming={cases.naming.renaming === c.id}
              onClick={() => open(c.id)}
              onRename={(name) => cases.naming.finish(c.id, name)}
              onContextMenu={(e) => caseMenu(e, c.id)}
            />
          ))}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
};
