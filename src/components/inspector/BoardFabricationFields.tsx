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

  if (!routed) return null;

  const rules = routed.rules ?? { source: '', clearanceMm: null, trackWidthMm: null, drillMm: null };
  const update = (patch: Partial<BoardFabricationRules>) =>
    onChange({ ...board, routed: { ...routed, rules: { ...rules, ...patch } } });

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
      <NumberInput
        label="Minimum clearance"
        value={rules.clearanceMm ?? 0}
        min={0}
        max={10}
        precision={3}
        step={0.01}
        onChange={(value, live) => !live && update({ clearanceMm: value > 0 ? value : null })}
      />
      <NumberInput
        label="Minimum track width"
        value={rules.trackWidthMm ?? 0}
        min={0}
        max={10}
        precision={3}
        step={0.01}
        onChange={(value, live) => !live && update({ trackWidthMm: value > 0 ? value : null })}
      />
      <NumberInput
        label="Minimum drill"
        value={rules.drillMm ?? 0}
        min={0}
        max={10}
        precision={3}
        step={0.01}
        onChange={(value, live) => !live && update({ drillMm: value > 0 ? value : null })}
      />
    </Section>
  );
}
