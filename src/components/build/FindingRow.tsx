import React, { useState } from 'react';
import { Button, ContextMenu, RowActions, type ContextMenuEntry } from '../../design-system';
import type { FindingFix, ReadinessFinding } from '../../readiness/types';
import type { ScenePart } from '../../types/robotics';
import { PartLinks } from './PartLinks';
import type { TetherControl } from './TetherFields';

export interface FindingActions {
  onFix?: (finding: ReadinessFinding) => void;
  onApplyFix?: Partial<Record<FindingFix['kind'], (finding: ReadinessFinding) => void>>;
  onQuote?: (finding: ReadinessFinding) => void;
  onIgnore: (finding: ReadinessFinding) => void;
  onIgnoreRule: (finding: ReadinessFinding) => void;
  onSelectParts: (ids: string[]) => void;
}

export interface FindingContext {
  parts: ScenePart[];
  panScroll: boolean;
  actions: FindingActions;
  tether?: TetherControl;
  onOpenCase?: (id: string) => void;
  showDots?: (check: string | null) => void;
}

const FIX_LABELS: Record<string, string> = {
  'new-case': 'New Case',
  'replay-fall': 'Replay in Sim',
  'make-actuator': 'Make an Actuator',
};

function useFindingMenu(finding: ReadinessFinding, actions: FindingActions) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const items: ContextMenuEntry[] = [
    { label: 'Ignore', onSelect: () => actions.onIgnore(finding) },
    { label: `Ignore All ${finding.ruleName}`, onSelect: () => actions.onIgnoreRule(finding) },
    ...(actions.onQuote ? [{ label: 'Quote', onSelect: () => actions.onQuote?.(finding) }] : []),
  ];

  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setAt({ x: e.clientX, y: e.clientY });
    },
    menu: at && <ContextMenu x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />,
  };
}

const fixOf = (finding: ReadinessFinding, actions: FindingActions) =>
  finding.fix ? actions.onApplyFix?.[finding.fix.kind] : actions.onFix;

const FixButton: React.FC<{ finding: ReadinessFinding; fix: (finding: ReadinessFinding) => void }> = ({
  finding,
  fix,
}) => (
  <Button variant="secondary" size="xs" className="shrink-0" onClick={() => fix(finding)}>
    {FIX_LABELS[finding.fix?.kind ?? ''] ?? 'Fix'}
  </Button>
);

interface FindingRowProps {
  finding: ReadinessFinding;
  context: FindingContext;
  children?: React.ReactNode;
}

const FindingText: React.FC<FindingRowProps & { muted?: boolean }> = ({ finding, context, muted, children }) => (
  <div className="min-w-0 flex-1">
    <p className={`text-[13px] leading-[18px] ${muted ? 'text-white/60' : 'text-white/90'}`}>{finding.text}</p>
    {finding.detail && <p className="text-[12px] leading-[16px] text-white/50">{finding.detail}</p>}
    <PartLinks
      ids={finding.ids}
      parts={context.parts}
      panScroll={context.panScroll}
      onSelect={context.actions.onSelectParts}
    />
    {finding.dispute && (
      <p className="mt-0.5 text-[12px] leading-[16px] text-white/50">The agent disagrees: {finding.dispute.reason}</p>
    )}
    {children}
  </div>
);

export const BlockerRow: React.FC<FindingRowProps> = ({ finding, context, children }) => {
  const { onContextMenu, menu } = useFindingMenu(finding, context.actions);
  const fix = fixOf(finding, context.actions);

  return (
    <li
      data-finding={finding.key}
      className="flex items-start gap-2 py-1.5 pl-[31px] pr-[7px]"
      onContextMenu={onContextMenu}
    >
      <FindingText finding={finding} context={context}>
        {children}
      </FindingText>
      {fix && <FixButton finding={finding} fix={fix} />}
      {menu}
    </li>
  );
};

export const NoteRow: React.FC<FindingRowProps> = ({ finding, context, children }) => {
  const { onContextMenu, menu } = useFindingMenu(finding, context.actions);
  const fix = fixOf(finding, context.actions);

  return (
    <li
      data-finding={finding.key}
      className="group relative py-1.5 pl-[31px] pr-[7px] rounded-lg hover:bg-[#333333]"
      onContextMenu={onContextMenu}
    >
      <FindingText finding={finding} context={context} muted>
        {children}
      </FindingText>
      {fix && (
        <RowActions fill="#333333" className="right-0 top-0.5 pr-1 rounded-r-lg">
          <FixButton finding={finding} fix={fix} />
        </RowActions>
      )}
      {menu}
    </li>
  );
};
