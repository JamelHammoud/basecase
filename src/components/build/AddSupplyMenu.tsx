import React, { useRef, useState } from 'react';
import { IconButton, MenuItem, MenuLabel, PlusIcon, PopoverMenu } from '../../design-system';
import { SUPPLIES, type SupplyGroup } from '../../data/supplies';

const SUPPLY_GROUPS: SupplyGroup[] = ['Power', 'Wiring', 'Electronics', 'Tools'];

export const AddSupplyMenu: React.FC<{ onAdd: (key: string) => void }> = ({ onAdd }) => {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const add = (key: string) => {
    setMenu(false);
    onAdd(key);
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton
        icon={<PlusIcon className="w-4 h-4" />}
        title="Add supply"
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
