import { useState } from 'react';
import {
  Button,
  ChevronDownIcon,
  confirmAction,
  deleteEntry,
  IconButton,
  MenuDivider,
  MenuItem,
  PlusIcon,
  PopoverMenu,
  RenameField,
  renameEntry,
  RunIcon,
} from '../../design-system';
import type { Routines } from '../../workspace/useRoutines';
import { keyFor } from '../../app/shortcuts';

export function RoutineHeader({ routines }: { routines: Routines }) {
  const { store, editor, view, showToast, undo } = routines;
  const routine = view.routine;
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  if (!routine) return null;

  const close = () => setOpen(false);
  const closing = (action: () => unknown) => () => {
    close();
    action();
  };
  const remove = () =>
    confirmAction({
      title: `Delete ${routine.name}?`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        if (!store.remove(routine.id)) return;

        showToast(`Deleted ${routine.name}`, { action: { label: 'Undo', onClick: undo } });
      },
    });
  const rename = (name: string | null) => {
    setRenaming(false);

    if (name) store.rename(routine.id, name);
  };
  const runnable = !!view.compiled?.ok && !(view.run && !view.run.done);

  return (
    <div className="px-[12px] pb-1 flex items-center gap-1">
      <div className="relative flex-1 min-w-0">
        {renaming ? (
          <RenameField
            name={routine.name}
            label="Routine name"
            onDone={rename}
            className="w-full h-[32px]! text-[14px]! font-medium"
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="max-w-full -ml-2 text-[14px] text-white/90"
            iconRight={<ChevronDownIcon className="w-3.5 h-3.5" />}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen(!open)}
          >
            {routine.name}
          </Button>
        )}
        <PopoverMenu isOpen={open} onClose={close} position="bottom" align="start">
          {store.routines.map((r) => (
            <MenuItem
              key={r.id}
              checked={r.id === routine.id}
              label={r.name}
              onSelect={closing(() => store.select(r.id))}
            />
          ))}
          <MenuDivider />
          <MenuItem icon={<PlusIcon />} label="New Routine" onSelect={closing(store.create)} />
          <MenuItem {...renameEntry(closing(() => setRenaming(true)))} />
          <MenuDivider />
          <MenuItem {...deleteEntry(closing(remove))} />
        </PopoverMenu>
      </div>
      <IconButton size="sm" icon={<PlusIcon className="w-4 h-4" />} title="Add step" onClick={editor.addHere} />
      {runnable && (
        <Button
          size="sm"
          variant="primary"
          icon={<RunIcon className="w-4 h-4" />}
          title="Run Routine"
          shortcut={keyFor('run-routine')}
          onClick={() => void routines.run()}
        >
          Run
        </Button>
      )}
    </div>
  );
}
