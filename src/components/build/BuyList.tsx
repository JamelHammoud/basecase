import React, { useRef, useState } from 'react';
import {
  IconButton,
  MenuDivider,
  MenuItem,
  MenuLabel,
  PopoverMenu,
  Section,
  SpreadsheetIcon,
  confirmAction,
} from '../../design-system';
import { openLink } from '../../utils/openLink';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { describeKey } from '../../utils/bom';
import type { Bom, BomCategory, BomLine } from '../../utils/bomTypes';
import { AddSupplyMenu } from './AddSupplyMenu';
import { type Extra, withAdded, withQty, without } from './buyExtras';
import { BuyTotal } from './BuyTotal';
import { BuyGroup } from './BuyGroup';
import { bomGroups } from './buyLine';
import type { BuyContext } from './BuyRow';
import { type Cart, bomCart } from './cart';
import { CheckIcon } from './CheckIcon';
import { plural } from '../../../electron/plural.mjs';

interface BuyListProps {
  bom: Bom;
  parts: ScenePart[];
  panScroll: boolean;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  onCheck: (line: BomLine) => void;
  onOnHand: (line: BomLine, count: number) => void;
  onSelectParts: (ids: string[]) => void;
  onExportCsv: () => void;
  onExportMarkdown: () => void;
}

interface ExportBomMenuProps {
  cart: Cart;
  onExportCsv: () => void;
  onExportMarkdown: () => void;
}

const StoreLinks: React.FC<{ cart: Cart; onOpen: (url: string) => void }> = ({ cart, onOpen }) => (
  <>
    {cart.stores.map(({ store, links }) => (
      <React.Fragment key={store}>
        <MenuLabel>{store}</MenuLabel>
        {links.map((link) => (
          <MenuItem key={link.key} label={link.name} onSelect={() => onOpen(link.url)} />
        ))}
      </React.Fragment>
    ))}
  </>
);

const ExportBomMenu: React.FC<ExportBomMenuProps> = ({ cart, onExportCsv, onExportMarkdown }) => {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const run = (action: () => void) => {
    setMenu(false);
    action();
  };
  const open = (url: string) => run(() => openLink(url));
  const { amazonUrl } = cart;

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
        className="w-64 max-h-[60vh] overflow-y-auto"
      >
        <MenuItem label="CSV Spreadsheet" onSelect={() => run(onExportCsv)} />
        <MenuItem label="Markdown" onSelect={() => run(onExportMarkdown)} />
        {(amazonUrl || cart.stores.length > 0) && <MenuDivider />}
        {amazonUrl && <MenuItem label="Buy All" detail="amazon.com" onSelect={() => open(amazonUrl)} />}
        <StoreLinks cart={cart} onOpen={open} />
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
        Replace {plural(count, 'stand-in')} with real parts
      </span>
    </button>
  </li>
);

export const BuyList: React.FC<BuyListProps> = ({
  bom,
  parts,
  panScroll,
  project,
  onChangeProject,
  onCheck,
  onOnHand,
  onSelectParts,
  onExportCsv,
  onExportMarkdown,
}) => {
  const extras = project.extras ?? [];
  const onChangeExtras = (next: Extra[]) => onChangeProject({ extras: next });
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
    onOnHand,
    onDeleteExtra: (line) =>
      confirmAction({
        title: `Delete ${line.name}?`,
        onConfirm: () => onChangeExtras(without(extras, line.key)),
      }),
  };

  return (
    <Section
      title="Bill of materials"
      actions={
        <>
          <AddSupplyMenu onAdd={addSupply} />
          {groups.length > 0 && (
            <ExportBomMenu cart={bomCart(bom.lines)} onExportCsv={onExportCsv} onExportMarkdown={onExportMarkdown} />
          )}
        </>
      }
    >
      <BuyTotal totals={bom.totals} project={project} onChangeProject={onChangeProject} />
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
