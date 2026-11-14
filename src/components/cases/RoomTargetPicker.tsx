import type { RoomTarget } from '../../cases/roomTargets';
import { ChoiceGrid, FieldRow } from '../../design-system';

const AHEAD = '';
const COLUMNS = 2;

interface RoomTargetPickerProps {
  count: number;
  targets: RoomTarget[];
  picked: Array<string | null>;
  onPick: (index: number, name: string | null) => void;
}

export function RoomTargetPicker({ count, targets, picked, onPick }: RoomTargetPickerProps) {
  const options = [{ value: AHEAD, label: 'Ahead' }, ...targets.map((t) => ({ value: t.name, label: t.name }))];

  return Array.from({ length: count }, (_, i) => {
    const label = count > 1 ? `Spot ${i + 1}` : 'Spot';

    return (
      <FieldRow key={i} label={label} group>
        <ChoiceGrid
          label={label}
          columns={COLUMNS}
          value={picked[i] ?? AHEAD}
          onChange={(name) => onPick(i, name || null)}
          options={options}
        />
      </FieldRow>
    );
  });
}
