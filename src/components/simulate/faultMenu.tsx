import { MenuDivider, MenuItem, type ContextMenuEntry } from '../../design-system';
import { FAULT_KINDS, FAULT_LABEL, type FaultKind } from '../../sim/faults';

export { FAULT_LABEL };

export interface AddToCase {
  listed: boolean;
  onSelect: () => void;
}

export function faultSubmenu(
  current: FaultKind | undefined,
  pick: (kind: FaultKind | null) => void,
  addToCase?: AddToCase,
): ContextMenuEntry {
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
        {addToCase && (
          <MenuItem
            label="Add to Case"
            disabled={!current || addToCase.listed}
            onSelect={() => {
              addToCase.onSelect();
              close();
            }}
          />
        )}
      </>
    ),
  };
}

export function faultJointMenu(
  joints: ReadonlyArray<{ id: string; name: string }>,
  choose: (joint: string, kind: FaultKind) => void,
  listed: (joint: string, kind: FaultKind) => boolean,
): ContextMenuEntry[] {
  return joints.map((joint) => ({
    label: joint.name,
    submenuWidth: 180,
    submenu: (close: () => void) => (
      <>
        {FAULT_KINDS.map((kind) => (
          <MenuItem
            key={kind}
            label={FAULT_LABEL[kind]}
            disabled={listed(joint.id, kind)}
            onSelect={() => {
              choose(joint.id, kind);
              close();
            }}
          />
        ))}
      </>
    ),
  }));
}
