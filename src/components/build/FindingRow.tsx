import React, { useRef, useState } from 'react';
import { Button, IconButton, MenuItem, MoreIcon, PopoverMenu, RowActions } from '../../design-system';
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

const MoreMenu: React.FC<{ finding: ReadinessFinding; actions: FindingActions }> = ({ finding, actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const run = (action?: (f: ReadinessFinding) => void) => () => {
    setOpen(false);
    action?.(finding);
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={<MoreIcon className="w-4 h-4" />}
        title="More"
        size="xs"
        isToggled={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      <PopoverMenu isOpen={open} onClose={() => setOpen(false)} ignoreRef={ref} position="bottom" align="end">
        <MenuItem label="Ignore" onSelect={run(actions.onIgnore)} />
        <MenuItem label={`Ignore All ${finding.ruleName}`} onSelect={run(actions.onIgnoreRule)} />
        {actions.onQuote && <MenuItem label="Quote" onSelect={run(actions.onQuote)} />}
      </PopoverMenu>
    </div>
  );
};

const FindingButtons: React.FC<{ finding: ReadinessFinding; actions: FindingActions }> = ({ finding, actions }) => {
  const fix = finding.fix ? actions.onApplyFix?.[finding.fix.kind] : actions.onFix;

  return (
    <>
      {fix && (
        <Button variant="secondary" size="xs" onClick={() => fix(finding)}>
          {finding.fix?.kind === 'new-case' ? 'New Case' : 'Fix'}
        </Button>
      )}
      <MoreMenu finding={finding} actions={actions} />
    </>
  );
};

interface FindingRowProps {
  finding: ReadinessFinding;
  context: FindingContext;
  children?: React.ReactNode;
}

const FindingText: React.FC<FindingRowProps & { muted?: boolean }> = ({ finding, context, muted, children }) => (
  <div className="min-w-0 flex-1">
    <p className={`text-[13px] leading-[18px] ${muted ? 'text-white/65' : 'text-white/85'}`}>{finding.text}</p>
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

export const BlockerRow: React.FC<FindingRowProps> = ({ finding, context, children }) => (
  <li className="flex items-start gap-2 py-1.5 pl-[31px] pr-[7px]">
    <FindingText finding={finding} context={context}>
      {children}
    </FindingText>
    <div className="flex items-center gap-1 shrink-0">
      <FindingButtons finding={finding} actions={context.actions} />
    </div>
  </li>
);

export const NoteRow: React.FC<FindingRowProps> = ({ finding, context, children }) => (
  <li className="group relative py-1.5 pl-[31px] pr-[7px] rounded-lg hover:bg-[#333333]">
    <FindingText finding={finding} context={context} muted>
      {children}
    </FindingText>
    <RowActions fill="#333333" className="right-0 top-0.5 gap-1 pr-1 rounded-r-lg">
      <FindingButtons finding={finding} actions={context.actions} />
    </RowActions>
  </li>
);
