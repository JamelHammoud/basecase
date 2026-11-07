import React, { useRef, useState } from 'react';
import { IconButton, MenuItem, PopoverMenu, Section, SpreadsheetIcon } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import type { Bom, BomLine } from '../../utils/bomTypes';
import { BuyGroup } from './BuyGroup';
import { bomGroups } from './buyLine';
import { CheckIcon } from './CheckIcon';
import { plural } from './format';

interface BuyListProps {
  bom: Bom;
  parts: ScenePart[];
  panScroll: boolean;
  onCheck: (line: BomLine) => void;
  onSelectParts: (ids: string[]) => void;
  onExportCsv: () => void;
  onExportMarkdown: () => void;
}


const ExportBomMenu: React.FC<Pick<BuyListProps, 'onExportCsv' | 'onExportMarkdown'>> = ({
  onExportCsv,
  onExportMarkdown,
}) => {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={<SpreadsheetIcon className="w-4 h-4" />}
        title="Export bill of materials"
        size="xs"
        isToggled={menu}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
      />
      <PopoverMenu
        isOpen={menu}
        onClose={() => setMenu(false)}
        ignoreRef={ref}
        position="bottom"
        align="end"
        className="w-48"
      >
        <MenuItem label="CSV Spreadsheet" onSelect={() => (setMenu(false), onExportCsv())} />
        <MenuItem label="Markdown" onSelect={() => (setMenu(false), onExportMarkdown())} />
      </PopoverMenu>
    </div>
  );
};

const StandInsRow: React.FC<{ count: number; onClick: () => void }> = ({ count, onClick }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2 py-1.5 px-[7px] rounded-lg text-left cursor-default hover:bg-white/[0.04]"
    >
      <CheckIcon status="warn" />
      <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-white/90">
        Replace {count} {plural(count, 'stand-in', 'stand-ins')} with real parts
      </span>
    </button>
  </li>
);

export const BuyList: React.FC<BuyListProps> = ({
  bom,
  parts,
  panScroll,
  onCheck,
  onSelectParts,
  onExportCsv,
  onExportMarkdown,
}) => {
  const groups = bomGroups(bom);
  const standIns = bom.standIns.length;
  const hasRows = groups.length > 0 || standIns > 0;

  return (
    <Section
      title="Bill of materials"
      actions={groups.length > 0 && <ExportBomMenu onExportCsv={onExportCsv} onExportMarkdown={onExportMarkdown} />}
    >
      {!hasRows && !bom.madeElsewhere.length && <span className="text-[13px] text-white/45">No parts</span>}
      {hasRows && (
        <ul className="-mx-[7px]">
          {standIns > 0 && (
            <StandInsRow count={standIns} onClick={() => onSelectParts(bom.standIns.map((s) => s.id))} />
          )}
          {groups.map((group) => (
            <BuyGroup
              key={group.category}
              group={group}
              defaultOpen={groups.length === 1}
              context={{ parts, panScroll, onCheck, onSelectParts }}
            />
          ))}
        </ul>
      )}
    </Section>
  );
};
