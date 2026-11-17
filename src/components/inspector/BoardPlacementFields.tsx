import { confirmAction, DeleteIcon, IconButton, NumberInput, Section, Select, Switch } from '../../design-system';
import type { BoardPlacement } from '../../wiring/boardTypes';
import { boardProduct } from '../../wiring/boardProducts';

export function BoardPlacementFields({
  placement,
  onChange,
  onDelete,
}: {
  placement: BoardPlacement;
  onChange: (value: BoardPlacement) => void;
  onDelete: () => void;
}) {
  const setPosition = (index: number, value: number, live?: boolean) => {
    if (live) return;

    const position: [number, number] = [...placement.position];

    position[index] = value;
    onChange({ ...placement, position, unplaced: false });
  };

  return (
    <Section
      title={boardProduct(placement.productId)?.mpn ?? placement.productId}
      collapsible
      actions={
        <IconButton
          icon={<DeleteIcon />}
          title="Delete"
          variant="danger"
          onClick={() =>
            confirmAction({
              title: `Delete ${boardProduct(placement.productId)?.mpn ?? placement.productId}?`,
              onConfirm: onDelete,
            })
          }
        />
      }
    >
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="X"
          aria-label={`${placement.id} X`}
          value={placement.position[0]}
          onChange={(value, live) => setPosition(0, value, live)}
        />
        <NumberInput
          label="Z"
          aria-label={`${placement.id} Z`}
          value={placement.position[1]}
          onChange={(value, live) => setPosition(1, value, live)}
        />
      </div>
      <Select
        aria-label={`${placement.id} Rotation`}
        value={String(placement.rotation)}
        options={[0, 90, 180, 270].map((angle) => ({ value: String(angle), label: `${angle}°` }))}
        onChange={(event) =>
          onChange({
            ...placement,
            rotation: Number(event.target.value) as BoardPlacement['rotation'],
            unplaced: false,
          })
        }
      />
      <Switch
        label="Locked"
        checked={placement.locked}
        onChange={(locked) => onChange({ ...placement, locked, unplaced: false })}
      />
    </Section>
  );
}
