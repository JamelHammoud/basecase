import { FieldRow, NumberInput, Section, TextInput } from '../../design-system';
import type { ElectronicsBoard } from '../../wiring/boardTypes';
import type { BoardFabricationRules } from '../../wiring/boardRoutingTypes';

export function BoardFabricationFields({
  board,
  onChange,
}: {
  board: ElectronicsBoard;
  onChange: (board: ElectronicsBoard) => void;
}) {
  const routed = board.routed;

  const rules = routed?.rules ??
    board.fabrication ?? { source: '', clearanceMm: null, trackWidthMm: null, drillMm: null };
  const update = (patch: Partial<BoardFabricationRules>) => {
    const next = { ...rules, ...patch };

    onChange(routed ? { ...board, routed: { ...routed, rules: next } } : { ...board, fabrication: next });
  };

  return (
    <Section title="Fabrication" collapsible defaultOpen={false}>
      <FieldRow label="Source">
        <TextInput
          aria-label="Fabrication source"
          maxLength={512}
          value={rules.source}
          onChange={(event) => update({ source: event.target.value })}
        />
      </FieldRow>
      {(
        [
          ['clearanceMm', 'Minimum clearance'],
          ['trackWidthMm', 'Minimum track width'],
          ['drillMm', 'Minimum drill'],
        ] as const
      ).map(([key, label]) => (
        <FieldRow key={key} label={label} group>
          <NumberInput
            aria-label={label}
            value={rules[key]}
            min={0}
            max={10}
            precision={3}
            step={0.01}
            onChange={(value, live) => !live && update({ [key]: value > 0 ? value : null })}
          />
        </FieldRow>
      ))}
    </Section>
  );
}
