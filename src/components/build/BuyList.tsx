import React, { useRef, useState } from 'react';
import { IconButton, MenuItem, PopoverMenu, Section, SpreadsheetIcon, confirmAction } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { describeKey } from '../../utils/bom';
import type { Bom, BomCategory, BomLine } from '../../utils/bomTypes';
import { AddSupplyMenu } from './AddSupplyMenu';
import { type Extra, withAdded, withQty, without } from './buyExtras';
import { BuyGroup } from './BuyGroup';
import { bomGroups } from './buyLine';
import type { BuyContext } from './BuyRow';
import { CheckIcon } from './CheckIcon';
import { plural } from './format';

interface BuyListProps {
  bom: Bom;
  parts: ScenePart[];
  panScroll: boolean;
  extras: Extra[];
  onChangeExtras: (extras: Extra[]) => void;
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
  extras,
  onChangeExtras,
  onCheck,
  onSelectParts,
  onExportCsv,
  onExportMarkdown,
}) => {
  const [openGroups, setOpenGroups] = useState<Partial<Record<BomCategory, boolean>>>({});
  const groups = bomGroups(bom);
  const standIns = bom.standIns.length;
  const hasRows = groups.length > 0 || standIns > 0;
  const isOpen = (category: BomCategory) => openGroups[category] ?? groups.length === 1;
  const setOpen = (category: BomCategory | undefined, open: boolean) =>
    category && setOpenGroups((state) => ({ ...state, [category]: open }));
  const addSupply = (key: string) => {
    onChangeExtras(withAdded(extras, key));
    setOpen(describeKey(key)?.category, true);
  };
  const context: BuyContext = {
    parts,
    panScroll,
    onCheck,
    onSelectParts,
    extraOf: (key) => extras.find((x) => x.key === key),
    onExtraQty: (key, qty) => onChangeExtras(withQty(extras, key, qty)),
    onRemoveExtra: (line) =>
      confirmAction({
        title: `Remove ${line.name}?`,
        confirmLabel: 'Remove',
        onConfirm: () => onChangeExtras(without(extras, line.key)),
      }),
  };

  return (
    <Section
      title="Bill of materials"
      actions={
        <>
          <AddSupplyMenu onAdd={addSupply} />
          {groups.length > 0 && <ExportBomMenu onExportCsv={onExportCsv} onExportMarkdown={onExportMarkdown} />}
        </>
      }
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
              open={isOpen(group.category)}
              onToggle={() => setOpen(group.category, !isOpen(group.category))}
              context={context}
            />
          ))}
        </ul>
      )}
    </Section>
  );
};
