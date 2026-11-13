import { useState } from 'react';
import {
  Button,
  ChevronDownIcon,
  confirmAction,
  DeleteIcon,
  EditIcon,
  IconButton,
  MenuDivider,
  MenuItem,
  PlusIcon,
  PopoverMenu,
  RunIcon,
  TextInput,
} from '../../design-system';
import type { Routines } from '../../workspace/useRoutines';

function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [draft, setDraft] = useState(name);

  return (
    <TextInput
      bare
      autoFocus
      aria-label="Routine name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(draft);
        else if (e.key === 'Escape') onDone(null);
      }}
      className="h-8 text-[14px] font-medium"
    />
  );
}

export function RoutineHeader({ routines }: { routines: Routines }) {
  const { store, editor, view, showToast } = routines;
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

        showToast(`Deleted ${routine.name}`, { action: { label: 'Undo', onClick: () => store.undo() } });
      },
    });
  const rename = (name: string | null) => {
    setRenaming(false);

    if (name !== null) store.rename(routine.id, name);
  };
  const runnable = !!view.compiled?.ok && !(view.run && !view.run.done);

  return (
    <div className="px-[12px] pb-1 flex items-center gap-1">
      <div className="relative flex-1 min-w-0">
        {renaming ? (
          <RenameField name={routine.name} onDone={rename} />
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
          <MenuItem icon={<PlusIcon className="w-4 h-4" />} label="New Routine" onSelect={closing(store.create)} />
          <MenuItem
            icon={<EditIcon className="w-4 h-4" />}
            label="Rename"
            onSelect={closing(() => setRenaming(true))}
          />
          <MenuItem icon={<DeleteIcon className="w-4 h-4" />} label="Delete" tone="danger" onSelect={closing(remove)} />
        </PopoverMenu>
      </div>
      <IconButton size="sm" icon={<PlusIcon className="w-4 h-4" />} title="Add step" onClick={editor.addHere} />
      {runnable && (
        <Button
          size="sm"
          variant="primary"
          icon={<RunIcon className="w-4 h-4" />}
          title="Run Routine"
          shortcut="⌘↩"
          onClick={() => void routines.run()}
        >
          Run
        </Button>
      )}
    </div>
  );
}
