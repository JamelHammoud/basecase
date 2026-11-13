import { MenuDivider, MenuItem, type ContextMenuEntry } from '../../design-system';
import { FAULT_KINDS, type FaultKind } from '../../sim/faults';

export const FAULT_LABEL: Record<FaultKind, string> = { limp: 'Limp', weak: 'Weak', stuck: 'Stuck', laggy: 'Laggy' };

export function faultSubmenu(current: FaultKind | undefined, pick: (kind: FaultKind | null) => void): ContextMenuEntry {
  const choose = (kind: FaultKind | null, close: () => void) => {
    pick(kind);
    close();
  };

  return {
    label: 'Fault',
    submenuWidth: 180,
    submenu: (close) => (
      <>
        {FAULT_KINDS.map((kind) => (
          <MenuItem
            key={kind}
            label={FAULT_LABEL[kind]}
            checked={current === kind}
            onSelect={() => choose(kind, close)}
          />
        ))}
        <MenuDivider />
        <MenuItem label="Clear" disabled={!current} onSelect={() => choose(null, close)} />
      </>
    ),
  };
}
