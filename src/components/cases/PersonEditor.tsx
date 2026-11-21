import type { WorldObject } from '../../cases/schema';
import { Button, FieldRow, NumberInput } from '../../design-system';
import type { CasePeople } from '../../workspace/casePeople';
import { PersonRouteEditor } from './PersonRouteEditor';

interface PersonEditorProps {
  object: WorldObject;
  people: CasePeople;
}

const DIMENSIONS = [
  { label: 'Width', min: 200, max: 1000 },
  { label: 'Height', min: 500, max: 2400 },
  { label: 'Depth', min: 100, max: 800 },
];

export function PersonEditor({ object, people }: PersonEditorProps) {
  const person = object.person!;
  const resize = (axis: number, value: number) => {
    const size = object.size.map((n, i) => (i === axis ? value : n)) as WorldObject['size'];
    const rise = axis === 1 ? (value - object.size[1]) / 2 : 0;
    const route = person.route.map((point) => ({
      ...point,
      position: [point.position[0], point.position[1] + rise, point.position[2]] as WorldObject['position'],
    }));

    people.replace({ ...object, size, position: route[0].position, person: { ...person, route } });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="person-editor">
      <div className="flex min-h-[32px] items-center justify-between gap-2">
        <span className="text-[13px] text-white/90 truncate">{object.name}</span>
        <Button size="sm" variant="danger" disabled={people.disabled} onClick={() => people.remove(object)}>
          Delete
        </Button>
      </div>
      {DIMENSIONS.map((dimension, axis) => (
        <FieldRow key={dimension.label} label={dimension.label}>
          <NumberInput
            className="min-w-0"
            aria-label={dimension.label}
            value={object.size[axis]}
            unit="mm"
            min={dimension.min}
            max={dimension.max}
            disabled={people.disabled}
            onChange={(value) => resize(axis, value)}
          />
        </FieldRow>
      ))}
      <FieldRow label="Speed">
        <NumberInput
          className="min-w-0"
          aria-label="Speed"
          value={person.speedMmS}
          unit="mm/s"
          min={50}
          max={3000}
          disabled={people.disabled}
          onChange={(speedMmS) => people.replace({ ...object, person: { ...person, speedMmS } })}
        />
      </FieldRow>
      <FieldRow label="Start">
        <NumberInput
          className="min-w-0"
          aria-label="Start"
          value={person.startSeconds}
          unit="s"
          min={0}
          max={600}
          precision={2}
          disabled={people.disabled}
          onChange={(startSeconds) => people.replace({ ...object, person: { ...person, startSeconds } })}
        />
      </FieldRow>
      <PersonRouteEditor object={object} people={people} />
    </div>
  );
}
