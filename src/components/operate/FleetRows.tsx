import React from 'react';
import { inspectUnitProblems, useFleetIncidents } from '../../robot/fleetIncidentStore';
import type { FleetIncident } from '../../robot/fleetIncidents';
import { unitEntry } from '../../robot/robotUnits';
import { Button, MetaLine, RowActions } from '../../design-system';
import { StatusDot } from '../../design-system/StatusDot';
import type { RollOutState } from '../../fleet/rollOut';
import { useRollOut } from '../../fleet/rollOutStore';
import { rollBackUnit, selectUnit } from '../../robot/robotStore';
import type { Fleet, UnitEntry } from '../../robot/robotUnits';
import { useFleet } from '../../robot/useRobot';
import { rungLabel } from './RobotLadder';

const SHORT_VERSION = 7;

const ROW_FILL = '#2a2a2a';

function problemOf({ state }: UnitEntry, incidents: FleetIncident[]): string | null {
  const newest = state.messages[0]?.text ?? null;

  if (state.link === 'lost') return newest ?? state.lostMessage ?? 'Robot disconnected';

  if (state.status?.fault_latched) return newest ?? 'Robot stopped';

  return incidents.find((i) => i.active || i.acknowledgedAt === null)?.message ?? null;
}

function twinCount(rollOut: RollOutState | null, unit: UnitEntry) {
  const verdict = rollOut?.verdicts[unit.unit];

  return verdict && verdict.trials > 0 ? `${verdict.passes} of ${verdict.trials}` : null;
}

interface UnitRowProps {
  unit: UnitEntry;
  selected: boolean;
  rollOut: RollOutState | null;
  incidents: FleetIncident[];
}

function UnitRow({ unit, selected, rollOut, incidents }: UnitRowProps) {
  const problem = problemOf(unit, incidents);
  const held = rollOut?.held[unit.unit];
  const failure = rollOut?.failures[unit.unit];

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-fleet-unit={unit.unit}
      data-mode={unit.state.mode}
      data-version={unit.version ?? ''}
      data-fault={problem !== null}
      data-held={held ?? undefined}
      data-failure={failure ?? undefined}
      onClick={() => selectUnit(unit.unit)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;

        e.preventDefault();
        selectUnit(unit.unit);
      }}
      className={`group relative px-2.5 py-1.5 mb-[2px] rounded-lg cursor-default ${selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]'}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="min-w-0 truncate text-[13.5px] text-white/90">{unit.state.name ?? unit.unit}</span>
        {problem && <StatusDot tone="problem" label={problem} />}
      </span>
      <MetaLine
        className="text-[12px] text-white/50 tabular-nums"
        items={[rungLabel(unit.state.mode), unit.version?.slice(0, SHORT_VERSION), twinCount(rollOut, unit)]}
      />
      {held && <p className="text-[12px] text-white/50">{held}</p>}
      {failure && <p className="text-[12px] text-white/50">{failure}</p>}
      {incidents.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          title={`Inspect Problems for ${unit.unit}`}
          onClick={(event) => {
            event.stopPropagation();
            inspectUnitProblems(unit.unit);
          }}
        >
          Inspect Problems
        </Button>
      )}
      {unit.hasPrevious && (
        <RowActions fill={ROW_FILL} className="inset-y-0 right-0 pr-1.5 rounded-r-lg">
          <Button
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              void rollBackUnit(unit.unit);
            }}
          >
            Roll Back
          </Button>
        </RowActions>
      )}
    </div>
  );
}

export const FleetRows: React.FC = () => {
  const fleet: Fleet = useFleet();
  const rollOut = useRollOut();
  const incidents = useFleetIncidents();
  const retained = [...new Set(incidents.map((i) => i.unit))]
    .filter((unit) => !fleet.units.some((u) => u.unit === unit))
    .map((unit) => ({
      ...unitEntry(unit),
      state: { ...unitEntry(unit).state, name: incidents.find((i) => i.unit === unit)?.name },
    }));
  const rows = [...fleet.units, ...retained];

  if (rows.length === 0) return null;

  return (
    <div role="listbox" className="mb-3" data-testid="fleet">
      {rows.map((unit) => (
        <UnitRow
          key={unit.unit}
          unit={unit}
          selected={unit.unit === fleet.selected}
          rollOut={rollOut}
          incidents={incidents.filter((i) => i.unit === unit.unit)}
        />
      ))}
    </div>
  );
};
