import { BoardRoutingFields } from './BoardRoutingFields';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { BoardFabricationFields } from './BoardFabricationFields';
import { Button, NumberInput, Section, Select } from '../../design-system';
import type { ElectronicsBoard } from '../../wiring/boardTypes';
import { BoardPlacementFields } from './BoardPlacementFields';
import { BoardKeepoutFields } from './BoardKeepoutFields';
import { BoardHoleFields } from './BoardHoleFields';
import { newBoardHole } from '../../wiring/boardHardware';

export function BoardSection({
  board,
  onChange,
  onArrange,
  onImport,
  onRoute,
  partId,
}: {
  board?: ElectronicsBoard;
  onChange?: (value: ElectronicsBoard) => void;
  onArrange?: () => void;
  onImport?: () => void;
  onRoute?: () => void;
  partId: string;
}) {
  if (!board || !onChange || board.partId !== partId) return null;

  return (
    <>
      <Section title="Board">
        {onRoute && !IS_WEB_DEMO && (
          <Button variant="secondary" onClick={onRoute}>
            Route Board
          </Button>
        )}
        {onImport && (
          <Button variant="secondary" onClick={onImport}>
            Import Board
          </Button>
        )}
        {onArrange && (
          <Button variant="secondary" onClick={onArrange}>
            Auto Arrange
          </Button>
        )}
        <Select
          aria-label="Component side"
          value={board.side}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'bottom', label: 'Bottom' },
          ]}
          onChange={(event) => onChange({ ...board, side: event.target.value as ElectronicsBoard['side'] })}
        />
        {(['top', 'bottom'] as const).map((side) => (
          <NumberInput
            key={side}
            label={side === 'top' ? 'Top clearance' : 'Bottom clearance'}
            value={board.heightMm[side]}
            min={0}
            onChange={(value, live) => !live && onChange({ ...board, heightMm: { ...board.heightMm, [side]: value } })}
          />
        ))}
        <NumberInput
          label="Edge clearance"
          value={board.edgeClearanceMm}
          min={0}
          onChange={(value, live) => !live && onChange({ ...board, edgeClearanceMm: value })}
        />
      </Section>
      <BoardFabricationFields board={board} onChange={onChange} />
      <BoardRoutingFields board={board} onChange={onChange} />
      <Section title="Mounting holes" collapsible defaultOpen={false}>
        {board.holes.map((hole, index) => (
          <BoardHoleFields
            key={hole.id}
            hole={hole}
            onChange={(value) => onChange({ ...board, holes: board.holes.map((h, i) => (i === index ? value : h)) })}
            onDelete={() => onChange({ ...board, holes: board.holes.filter((_, i) => i !== index) })}
          />
        ))}
        <Button
          variant="secondary"
          disabled={board.holes.length >= 128}
          onClick={() => onChange({ ...board, holes: [...board.holes, newBoardHole()] })}
        >
          Add Hole
        </Button>
      </Section>
      <Section title="Keepouts" collapsible defaultOpen={false}>
        {board.keepouts.map((area, index) => (
          <BoardKeepoutFields
            key={area.id}
            area={area}
            onDelete={() => onChange({ ...board, keepouts: board.keepouts.filter((_, i) => i !== index) })}
            onChange={(value) =>
              onChange({ ...board, keepouts: board.keepouts.map((a, i) => (i === index ? value : a)) })
            }
          />
        ))}
        <Button
          variant="secondary"
          disabled={board.keepouts.length >= 128}
          onClick={() =>
            onChange({
              ...board,
              keepouts: [...board.keepouts, { id: crypto.randomUUID(), min: [-5, -5], max: [5, 5] }],
            })
          }
        >
          Add Keepout
        </Button>
      </Section>
      {board.placements.map((placement, index) => (
        <BoardPlacementFields
          key={placement.id}
          placement={placement}
          onDelete={() => onChange({ ...board, placements: board.placements.filter((_, i) => i !== index) })}
          onChange={(value) =>
            onChange({ ...board, placements: board.placements.map((p, i) => (i === index ? value : p)) })
          }
        />
      ))}
    </>
  );
}
