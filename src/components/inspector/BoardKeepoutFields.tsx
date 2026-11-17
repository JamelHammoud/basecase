import { confirmAction, DeleteIcon, IconButton, NumberInput } from '../../design-system';
import type { BoardKeepout } from '../../wiring/boardTypes';

export function BoardKeepoutFields({
  area,
  onChange,
  onDelete,
}: {
  area: BoardKeepout;
  onChange: (value: BoardKeepout) => void;
  onDelete: () => void;
}) {
  const set = (edge: 'min' | 'max', axis: number, value: number, live?: boolean) => {
    if (live) return;

    onChange({ ...area, [edge]: area[edge].map((n, i) => (i === axis ? value : n)) });
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {(['min', 'max'] as const).flatMap((edge) =>
          [0, 1].map((axis) => (
            <NumberInput
              key={`${edge}${axis}`}
              label={`${edge} ${axis === 0 ? 'X' : 'Z'}`}
              value={area[edge][axis]}
              min={edge === 'max' ? area.min[axis] + 0.1 : undefined}
              max={edge === 'min' ? area.max[axis] - 0.1 : undefined}
              onChange={(value, live) => set(edge, axis, value, live)}
            />
          )),
        )}
      </div>
      <div className="flex justify-end">
        <IconButton
          icon={<DeleteIcon />}
          variant="danger"
          title="Delete"
          variant="danger"
          onClick={() => confirmAction({ title: 'Delete keepout?', onConfirm: onDelete })}
        />
      </div>
    </div>
  );
}
