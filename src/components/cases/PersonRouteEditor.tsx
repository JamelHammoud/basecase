import { MAX_PERSON_WAYPOINTS } from '../../cases/personEncounter';
import type { WorldObject } from '../../cases/schema';
import { Button, NumberInput } from '../../design-system';
import { confirmAction } from '../../design-system/confirmStore';
import type { CasePeople } from '../../workspace/casePeople';

interface RouteProps {
  object: WorldObject;
  people: CasePeople;
}

export function PersonRouteEditor({ object, people }: RouteProps) {
  const person = object.person!;
  const route = person.route;
  const save = (next: typeof route) =>
    people.replace({ ...object, position: next[0].position, person: { ...person, route: next } });
  const coordinate = (index: number, axis: number, value: number) =>
    save(
      route.map((point, i) =>
        i === index
          ? {
              ...point,
              position: point.position.map((n, a) => (a === axis ? value : n)) as WorldObject['position'],
            }
          : point,
      ),
    );
  const remove = (index: number) =>
    confirmAction({
      title: `Delete waypoint ${index + 1}?`,
      onConfirm: () => save(route.filter((_, i) => i !== index)),
    });

  return (
    <div className="flex flex-col gap-2">
      {route.map((point, index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="flex min-h-[32px] items-center justify-between gap-2">
            <span className="text-[13px] text-white/60">Waypoint {index + 1}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={people.disabled || route.length <= 2}
              onClick={() => remove(index)}
            >
              Delete
            </Button>
          </div>
          <div className="flex gap-2">
            {[0, 2].map((axis) => (
              <NumberInput
                key={axis}
                label={axis === 0 ? 'X' : 'Z'}
                aria-label={`Waypoint ${index + 1} ${axis === 0 ? 'X' : 'Z'}`}
                value={point.position[axis]}
                unit="mm"
                min={-50000}
                max={50000}
                disabled={people.disabled}
                onChange={(value) => coordinate(index, axis, value)}
              />
            ))}
          </div>
          <NumberInput
            label="Pause"
            aria-label={`Waypoint ${index + 1} pause`}
            value={point.pauseSeconds}
            unit="s"
            min={0}
            max={10}
            precision={2}
            disabled={people.disabled}
            onChange={(pauseSeconds) =>
              save(route.map((entry, i) => (i === index ? { ...entry, pauseSeconds } : entry)))
            }
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="secondary"
        disabled={people.disabled || route.length >= MAX_PERSON_WAYPOINTS}
        onClick={() => {
          const last = route.at(-1)!;

          save([...route, { position: [last.position[0] + 500, last.position[1], last.position[2]], pauseSeconds: 0 }]);
        }}
      >
        Add Waypoint
      </Button>
    </div>
  );
}
