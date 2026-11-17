import { FieldRow, NumberInput, Section, TextInput } from '../../design-system';
import type { ElectronicsBoard } from '../../wiring/boardTypes';
import type { BoardRoutePlan } from '../../wiring/boardRouteContract.mjs';

const empty: BoardRoutePlan = {
  source: '',
  trackWidthMm: null,
  clearanceMm: null,
  viaDiameterMm: null,
  viaDrillMm: null,
  copperMm: null,
  dielectricMaterial: '',
  epsilonR: null,
  lossTangent: null,
  special: '',
};
const dimensions = [
  ['trackWidthMm', 'Track width', 'mm'],
  ['clearanceMm', 'Copper clearance', 'mm'],
  ['viaDiameterMm', 'Via diameter', 'mm'],
  ['viaDrillMm', 'Via drill', 'mm'],
  ['copperMm', 'Copper thickness', 'mm'],
  ['epsilonR', 'Dielectric permittivity', ''],
  ['lossTangent', 'Dielectric loss tangent', ''],
] as const;

export function BoardRoutingFields({
  board,
  onChange,
}: {
  board: ElectronicsBoard;
  onChange: (board: ElectronicsBoard) => void;
}) {
  if (board.routed) return null;

  const plan = board.routing ?? empty;
  const update = (patch: Partial<BoardRoutePlan>) => onChange({ ...board, routing: { ...plan, ...patch } });

  return (
    <Section title="Routing" collapsible defaultOpen={false}>
      <FieldRow label="Source">
        <TextInput
          aria-label="Routing source"
          maxLength={512}
          value={plan.source}
          onChange={(event) => update({ source: event.target.value })}
        />
      </FieldRow>
      {dimensions.map(([key, label, unit]) => (
        <FieldRow key={key} label={label} group>
          <NumberInput
            aria-label={label}
            value={plan[key]}
            unit={unit}
            min={0}
            max={100}
            precision={4}
            step={0.01}
            onChange={(value, live) => !live && update({ [key]: value })}
          />
        </FieldRow>
      ))}
      <FieldRow label="Dielectric material">
        <TextInput
          maxLength={80}
          value={plan.dielectricMaterial}
          onChange={(event) => update({ dielectricMaterial: event.target.value })}
        />
      </FieldRow>
      <FieldRow label="Special requirements">
        <TextInput maxLength={512} value={plan.special} onChange={(event) => update({ special: event.target.value })} />
      </FieldRow>
    </Section>
  );
}
