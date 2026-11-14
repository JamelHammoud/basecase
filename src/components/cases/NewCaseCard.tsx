import { useState } from 'react';
import { caseFields, goalValues, isMesh, specValues, worldsFor } from '../../cases/caseBuilder';
import { goalParam, type GoalKind, type GoalValues } from '../../cases/caseGoals';
import type { WorldKind } from '../../cases/caseWorlds';
import { Button, ChoiceGrid, FieldRow, NumberInput } from '../../design-system';
import type { CaseBuilder } from '../../workspace/useCaseBuilder';
import { RoomTargetPicker } from './RoomTargetPicker';
import { useRoomTargetPick } from './useRoomTargetPick';

const MAX_WORLD_COLUMNS = 3;

interface NewCaseCardProps {
  builder: CaseBuilder;
  onCreated: () => void;
}

const placeKind = (place: CaseBuilder['place']): WorldKind => {
  if (!place) return 'floor';

  return isMesh(place) ? 'mesh' : 'room';
};

export function NewCaseCard({ builder, onCreated }: NewCaseCardProps) {
  const [goalKind, setGoalKind] = useState<GoalKind>(builder.goals[0].kind);
  const [chosenWorld, setWorld] = useState<WorldKind>(placeKind(builder.place));
  const [given, setGiven] = useState<Partial<GoalValues>>({});
  const goal = builder.goals.find((g) => g.kind === goalKind) ?? builder.goals[0];
  const worlds = worldsFor(goal.kind, builder.robot, builder.place);
  const world = worlds.some((w) => w.kind === chosenWorld) ? chosenWorld : 'floor';
  const spots = useRoomTargetPick({
    builder,
    goal: goal.kind,
    world,
    values: goalValues(goal, builder.robot, given, world),
  });
  const chosen = spots.chosen;
  const spec = { goal: goal.kind, world, values: given, targets: chosen };
  const values =
    specValues({ ...spec, room: builder.room, meshWorld: builder.meshWorld }, builder.robot) ??
    goalValues(goal, builder.robot, given, world);
  const preview = builder.preview(spec);
  const fields = caseFields(goal, values, world).filter((key) => !(key === 'distanceMm' && chosen[0]));

  const pickGoal = (kind: GoalKind) => {
    setGoalKind(kind);
    setGiven({});
    spots.clear();
  };

  const pickWorld = (kind: WorldKind) => {
    setWorld(kind);
    setGiven((g) => ({ ...g, riseMm: undefined, inclineDeg: undefined }));
  };

  const create = () => {
    if (builder.create(spec).ok) onCreated();
  };

  return (
    <div
      className="mb-3 p-[12px] rounded-[10px] bg-white/[0.04] flex flex-col gap-3"
      data-testid="new-case"
      onKeyDown={(e) => {
        if (e.key === 'Escape') builder.cancel();
      }}
    >
      {builder.goals.length > 1 && (
        <ChoiceGrid
          label="Goal"
          columns={1}
          value={goal.kind}
          onChange={pickGoal}
          options={builder.goals.map((g) => ({ value: g.kind, label: g.name }))}
        />
      )}
      {worlds.length > 1 && (
        <ChoiceGrid
          label="World"
          columns={worlds.length > MAX_WORLD_COLUMNS ? 2 : worlds.length}
          value={world}
          onChange={pickWorld}
          options={worlds.map((w) => ({ value: w.kind, label: w.name, title: w.trueSize ? w.name : undefined }))}
        />
      )}
      <div className="flex flex-col gap-2">
        {spots.targets.length > 0 && (
          <RoomTargetPicker count={spots.count} targets={spots.targets} picked={chosen} onPick={spots.pick} />
        )}
        {fields.map((key) => {
          const param = goalParam(goal, key);

          return (
            <FieldRow key={key} label={param.label}>
              <NumberInput
                value={values[key]}
                unit={param.unit}
                min={param.min}
                max={param.max}
                step={param.step}
                precision={0}
                onChange={(v) => setGiven((g) => ({ ...g, [key]: v }))}
              />
            </FieldRow>
          );
        })}
      </div>
      <p className="text-[12.5px] leading-snug text-white/60" data-testid="new-case-brief">
        {preview.ok ? preview.kase.brief : preview.problem}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" title="Cancel" shortcut="Esc" onClick={builder.cancel}>
          Cancel
        </Button>
        <Button
          autoFocus
          variant="primary"
          size="sm"
          title="Make Case"
          shortcut="↩"
          disabled={!preview.ok}
          onClick={create}
        >
          Make Case
        </Button>
      </div>
    </div>
  );
}
