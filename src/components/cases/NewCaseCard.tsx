import { useState } from 'react';
import { caseFields, goalValues, specValues, worldsFor } from '../../cases/caseBuilder';
import { goalParam, type GoalKind, type GoalValues } from '../../cases/caseGoals';
import type { WorldKind } from '../../cases/caseWorlds';
import { Button, ChoiceGrid, FieldRow, NumberInput } from '../../design-system';
import type { CaseBuilder } from '../../workspace/useCaseBuilder';
import { RoomTargetPicker } from './RoomTargetPicker';
import { useRoomTargetPick } from './useRoomTargetPick';
import { fixtureFitsGoal } from '../../cases/householdKinds';
import { fixtureValueTitle } from '../../cases/fixtureValueSource';
import { useCaseDraft } from './useCaseDraft';
import { CaseFixtureChoice } from './CaseFixtureChoice';

const MAX_WORLD_COLUMNS = 3;

interface NewCaseCardProps {
  builder: CaseBuilder;
  onCreated: () => void;
}

export function NewCaseCard({ builder, onCreated }: NewCaseCardProps) {
  const [goalKind, setGoalKind] = useState<GoalKind>(builder.goals[0].kind);
  const initialWorld: WorldKind = builder.room ? 'room' : 'floor';
  const [chosenWorld, setWorld] = useState<WorldKind>(builder.imported ? 'imported' : initialWorld);
  const [given, setGiven] = useState<Partial<GoalValues>>({});
  const [fixtureId, setFixtureId] = useState('');
  const goal = builder.goals.find((g) => g.kind === goalKind) ?? builder.goals[0];
  const fixture = builder.fixtures.find((model) => model.id === fixtureId && fixtureFitsGoal(model, goal.kind));
  const worlds = worldsFor(goal.kind, builder.robot, builder.room, builder.imported);
  const world = worlds.some((w) => w.kind === chosenWorld) ? chosenWorld : 'floor';
  const spots = useRoomTargetPick({
    builder,
    goal: goal.kind,
    world,
    values: goalValues(goal, builder.robot, given, world),
  });
  const chosen = spots.chosen;
  const spec = { goal: goal.kind, world, values: given, targets: chosen, fixture };
  const values =
    specValues({ ...spec, room: builder.room, imported: builder.imported }, builder.robot) ??
    goalValues(goal, builder.robot, given, world);
  const preview = useCaseDraft(builder, spec);
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
    if (preview.ok && builder.create(spec, preview).ok) onCreated();
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
          options={worlds.map((w) => ({ value: w.kind, label: w.name }))}
        />
      )}
      <CaseFixtureChoice
        kind={goal.kind}
        models={builder.fixtures}
        value={fixtureId}
        onChange={(id) => {
          setFixtureId(id);
          setGiven({});
        }}
      />
      {world === 'imported' && builder.imported?.asset.world.reconstruction?.estimates.floor && (
        <p className="text-[12.5px] leading-snug text-white/60">Estimated floor and 1 m obstacle height</p>
      )}
      <div className="flex flex-col gap-2">
        {spots.targets.length > 0 && (
          <RoomTargetPicker count={spots.count} targets={spots.targets} picked={chosen} onPick={spots.pick} />
        )}
        {fields.map((key) => {
          const param = goalParam(goal, key);
          const title = fixtureValueTitle(fixture, key, given, param.label);

          return (
            <FieldRow key={key} label={param.label}>
              <NumberInput
                value={values[key]}
                aria-label={param.label}
                title={title}
                unit={param.unit}
                min={param.min}
                max={param.max}
                step={param.step}
                precision={key.startsWith('fixture') ? 3 : 0}
                onChange={(v) => setGiven((g) => (Object.is(g[key], v) ? g : { ...g, [key]: v }))}
              />
            </FieldRow>
          );
        })}
      </div>
      <p className="text-[12.5px] leading-snug text-white/60" data-testid="new-case-brief">
        {preview.ok ? preview.kase.brief : preview.problem}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" shortcut="Esc" onClick={builder.cancel}>
          Cancel
        </Button>
        <Button autoFocus variant="primary" size="sm" shortcut="↩" disabled={!preview.ok} onClick={create}>
          Make Case
        </Button>
      </div>
    </div>
  );
}
