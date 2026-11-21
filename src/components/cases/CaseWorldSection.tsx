import { Button, Section } from '../../design-system';
import type { Cases } from '../../workspace/useCases';
import { PersonEditor } from './PersonEditor';

export function CaseWorldSection({ cases }: { cases: Cases }) {
  const { people } = cases;

  return (
    <Section title="World">
      <div className="flex flex-col gap-3">
        {people.objects.map((object) => (
          <PersonEditor key={object.id} object={object} people={people} />
        ))}
        <Button size="sm" variant="secondary" fullWidth disabled={!people.canAdd} onClick={people.add}>
          Add Person
        </Button>
      </div>
    </Section>
  );
}
