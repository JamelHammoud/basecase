import React, { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { IconButton, MenuItem, MenuLabel, NumberInput, PopoverMenu, Section } from '../../design-system';
import { SUPPLIES, SUPPLY_BY_ID, type SupplyGroup } from '../../data/supplies';
import type { ProjectSettings } from '../../types/robotics';

type Extra = NonNullable<ProjectSettings['extras']>[number];

interface ExtrasSectionProps {
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
}

const SUPPLY_GROUPS: SupplyGroup[] = ['Power', 'Wiring', 'Electronics', 'Tools', 'Filament'];

const supplyOf = (key: string) => (key.startsWith('supply:') ? SUPPLY_BY_ID[key.slice(7)] : undefined);

const withAdded = (extras: Extra[], key: string): Extra[] =>
  extras.some((x) => x.key === key)
    ? extras.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x))
    : [...extras, { key, qty: 1 }];

const AddSupplyMenu: React.FC<{ onAdd: (key: string) => void }> = ({ onAdd }) => {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const add = (key: string) => {
    setMenu(false);
    onAdd(key);
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={<Plus className="w-4 h-4" />}
        title="Add supply"
        size="xs"
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
        {SUPPLY_GROUPS.map((g) => (
          <React.Fragment key={g}>
            <MenuLabel>{g}</MenuLabel>
            {SUPPLIES.filter((s) => s.group === g).map((s) => (
              <MenuItem key={s.id} label={s.name} onSelect={() => add(`supply:${s.id}`)} />
            ))}
          </React.Fragment>
        ))}
      </PopoverMenu>
    </div>
  );
};

const ExtraRow: React.FC<{ extra: Extra; onQty: (qty: number) => void; onRemove: () => void }> = ({
  extra: x,
  onQty,
  onRemove,
}) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 min-w-0">
      <div className="text-[13px] text-white/90 truncate">{supplyOf(x.key)?.name ?? x.key}</div>
      {x.note && <div className="text-[12px] text-white/40 truncate">{x.note}</div>}
    </div>
    <div className="w-[72px] shrink-0">
      <NumberInput
        value={x.qty}
        min={1}
        step={1}
        precision={0}
        unit=""
        title="Quantity"
        onChange={(v, live) => !live && onQty(Math.max(1, Math.round(v)))}
      />
    </div>
    <IconButton icon={<X className="w-3.5 h-3.5" />} title="Remove" size="xs" onClick={onRemove} />
  </div>
);

export const ExtrasSection: React.FC<ExtrasSectionProps> = ({ project, onChangeProject }) => {
  const extras = project.extras ?? [];
  const set = (next: Extra[]) => onChangeProject({ extras: next });

  return (
    <Section title="Supplies" actions={<AddSupplyMenu onAdd={(key) => set(withAdded(extras, key))} />}>
      {extras.map((x) => (
        <ExtraRow
          key={x.key}
          extra={x}
          onQty={(qty) => set(extras.map((e) => (e.key === x.key ? { ...e, qty } : e)))}
          onRemove={() => set(extras.filter((e) => e.key !== x.key))}
        />
      ))}
    </Section>
  );
};
