import { useState } from 'react';
import { Button, ContextMenu, IconButton, PlusIcon, Section, type ContextMenuEntry } from '../../design-system';
import type { Cases } from '../../workspace/useCases';
import { faultJointMenu } from '../simulate/faultMenu';

export function CaseFaultSection({ cases }: { cases: Cases }) {
  const { faultList } = cases;
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  if (!faultList.joints.length) return null;

  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();

    setMenu({
      x: box.left,
      y: box.bottom + 4,
      items: faultJointMenu(
        faultList.joints,
        (joint, kind) => faultList.add({ joint, kind }),
        (joint, kind) => faultList.has({ joint, kind }),
      ),
    });
  };

  return (
    <Section
      title="Faults"
      actions={
        <IconButton
          icon={<PlusIcon className="w-4 h-4" />}
          title="Fault"
          size="xs"
          data-testid="add-fault"
          disabled={!faultList.canAdd}
          onClick={openMenu}
        />
      }
    >
      {faultList.faults.map((fault) => (
        <div
          key={`${fault.joint}|${fault.kind}`}
          data-testid="case-fault"
          className="flex min-h-[32px] items-center justify-between gap-2"
        >
          <span className="text-[13px] text-white/90 truncate">{faultList.name(fault)}</span>
          <Button size="sm" variant="danger" onClick={() => faultList.remove(fault)}>
            Delete
          </Button>
        </div>
      ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </Section>
  );
}
