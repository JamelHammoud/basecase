import { FieldRow, NumberInput, Select, Switch } from '../../design-system';
import type { Study } from '../../workspace/useStudy';

export function StudyVisibilityField({ study }: { study: Study }) {
  const { visibility, running } = study;
  const { request, recordings, cameras, targets } = visibility;

  if (!recordings.length && !request) return null;

  return (
    <div className="flex flex-col gap-2">
      <FieldRow label="Try">
        <Select
          aria-label="Try"
          disabled={running}
          value={request?.tryId ?? ''}
          options={[
            { value: '', label: 'Choose Try' },
            ...recordings.map((recording) => ({
              value: recording.id,
              label: `${recording.caseName} ${recording.startedAt}`,
            })),
          ]}
          onChange={(event) => (event.target.value ? visibility.select(event.target.value) : visibility.clear())}
        />
      </FieldRow>
      {request && (
        <>
          {cameras.map((camera) => (
            <Switch
              key={camera.id}
              label={camera.name}
              checked={request.cameras.includes(camera.id)}
              disabled={running}
              onChange={(on) =>
                visibility.edit({
                  ...request,
                  cameras: on ? [...request.cameras, camera.id] : request.cameras.filter((id) => id !== camera.id),
                })
              }
            />
          ))}
          {targets.map((target) => {
            const selected = request.targets.find((value) => value.id === target.id);

            return (
              <div key={target.id} className="flex flex-col gap-1.5">
                <Switch
                  label={target.name}
                  checked={!!selected}
                  disabled={running}
                  onChange={(on) =>
                    visibility.edit({
                      ...request,
                      targets: on
                        ? [...request.targets, { id: target.id, minPixels: 100 }]
                        : request.targets.filter((value) => value.id !== target.id),
                    })
                  }
                />
                {selected && (
                  <FieldRow label="Minimum area">
                    <NumberInput
                      aria-label={`${target.name} minimum pixels`}
                      value={selected.minPixels}
                      min={1}
                      max={76800}
                      precision={0}
                      unit="px"
                      disabled={running}
                      onChange={(minPixels) =>
                        visibility.edit({
                          ...request,
                          targets: request.targets.map((value) =>
                            value.id === target.id ? { ...value, minPixels } : value,
                          ),
                        })
                      }
                    />
                  </FieldRow>
                )}
              </div>
            );
          })}
          <FieldRow label="Samples">
            <NumberInput
              aria-label="Samples"
              value={request.samples}
              min={2}
              max={32}
              precision={0}
              disabled={running}
              onChange={(samples) => visibility.edit({ ...request, samples })}
            />
          </FieldRow>
        </>
      )}
    </div>
  );
}
