import type { CustomModelDefinition } from '../../types/robotics';
import { fixtureFitsGoal } from '../../cases/householdKinds';
import { ChoiceGrid } from '../../design-system';

interface CaseFixtureChoiceProps {
  kind: string;
  models: CustomModelDefinition[];
  value: string;
  onChange: (id: string) => void;
}

export function CaseFixtureChoice({ kind, models, value, onChange }: CaseFixtureChoiceProps) {
  const eligible = models.filter((model) => fixtureFitsGoal(model, kind));

  if (eligible.length === 0) return null;

  return (
    <ChoiceGrid
      label="Fixture"
      columns={1}
      value={eligible.some((model) => model.id === value) ? value : ''}
      onChange={onChange}
      options={[{ value: '', label: 'Default' }, ...eligible.map((model) => ({ value: model.id, label: model.name }))]}
    />
  );
}
