import { useState } from 'react';
import { caseFields, caseName, goalValues, worldsFor } from '../../cases/caseBuilder';
import { goalParam, type GoalKind, type GoalValues } from '../../cases/caseGoals';
import type { WorldKind } from '../../cases/caseWorlds';
import { Button, ChoiceGrid, FieldRow, NumberInput, TextInput } from '../../design-system';
import type { CaseBuilder } from '../../workspace/useCaseBuilder';

const MAX_WORLD_COLUMNS = 3;

interface NewCaseCardProps {
  builder: CaseBuilder;
  onCreated: () => void;
}

export function NewCaseCard({ builder, onCreated }: NewCaseCardProps) {
  const [goalKind, setGoalKind] = useState<GoalKind>(builder.goals[0].kind);
  const [chosenWorld, setWorld] = useState<WorldKind>(builder.room ? 'room' : 'floor');
  const [given, setGiven] = useState<Partial<GoalValues>>({});
  const [name, setName] = useState<string | null>(null);
  const goal = builder.goals.find((g) => g.kind === goalKind) ?? builder.goals[0];
  const worlds = worldsFor(goal.kind, builder.robot, builder.room);
  const world = worlds.some((w) => w.kind === chosenWorld) ? chosenWorld : 'floor';
  const values = goalValues(goal, builder.robot, given, world);
  const spec = { goal: goal.kind, world, values: given, name: name ?? undefined };
  const preview = builder.preview(spec);

  const pickGoal = (kind: GoalKind) => {
    setGoalKind(kind);
    setGiven({});
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
          onChange={setWorld}
          options={worlds.map((w) => ({ value: w.kind, label: w.name, title: w.trueSize ? w.name : undefined }))}
        />
      )}
      <div className="flex flex-col gap-2">
        {caseFields(goal, values, world).map((key) => {
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
        <FieldRow label="Name">
          <TextInput
            value={name ?? caseName(goal.kind, world, values, builder.room)}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        </FieldRow>
      </div>
      <p className="text-[12.5px] leading-snug text-white/55" data-testid="new-case-brief">
        {preview.ok ? preview.kase.brief : preview.problem}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" title="Cancel" shortcut="Esc" onClick={builder.cancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" title="Make Case" shortcut="↩" disabled={!preview.ok} onClick={create}>
          Make Case
        </Button>
      </div>
    </div>
  );
}
