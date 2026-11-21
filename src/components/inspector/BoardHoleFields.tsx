import { confirmAction, DeleteIcon, IconButton, NumberInput } from '../../design-system';
import type { BoardHole } from '../../wiring/boardTypes';

export function BoardHoleFields({
  hole,
  onChange,
  onDelete,
}: {
  hole: BoardHole;
  onChange: (hole: BoardHole) => void;
  onDelete: () => void;
}) {
  const set = (axis: number, value: number, live?: boolean) => {
    if (live) return;

    onChange({ ...hole, position: hole.position.map((n, i) => (i === axis ? value : n)) as [number, number] });
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="X"
          aria-label={`${hole.id} X`}
          value={hole.position[0]}
          onChange={(value, live) => set(0, value, live)}
        />
        <NumberInput
          label="Z"
          aria-label={`${hole.id} Z`}
          value={hole.position[1]}
          onChange={(value, live) => set(1, value, live)}
        />
        <NumberInput
          label="Ø"
          aria-label={`${hole.id} Diameter`}
          value={hole.diameterMm}
          min={0.5}
          onChange={(value, live) => !live && onChange({ ...hole, diameterMm: value })}
        />
        <NumberInput
          label="Clearance"
          value={hole.keepoutMm}
          min={0}
          onChange={(value, live) => !live && onChange({ ...hole, keepoutMm: value })}
        />
      </div>
      <div className="flex justify-end">
        <IconButton
          icon={<DeleteIcon />}
          variant="danger"
          title="Delete"
          onClick={() => confirmAction({ title: 'Delete mounting hole and hardware?', onConfirm: onDelete })}
        />
      </div>
    </div>
  );
}
