import { routeOwners } from '../../wiring/routeEditing';
import { useState } from 'react';
import { Button, ConfirmDialog, FieldRow, NumberInput, Select } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import type { CableRoutes } from '../../workspace/useCableRoutes';

export function CableAnchorFields({
  index,
  routes,
  parts,
}: {
  index: number;
  routes: CableRoutes;
  parts: ScenePart[];
}) {
  const [confirming, setConfirming] = useState(false);
  const anchor = routes.anchors[index];
  const name = `Point ${index + 1}`;

  return (
    <div className="space-y-2" role="group" aria-label={name}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] text-white/90">{name}</span>
        <Button variant="ghost" size="xs" disabled={index === 0} onClick={() => routes.reorder(index, -1)}>
          Move Up
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={index === routes.anchors.length - 1}
          onClick={() => routes.reorder(index, 1)}
        >
          Move Down
        </Button>
      </div>
      <FieldRow label="Link">
        <Select
          aria-label="Link"
          value={anchor.partId}
          options={routeOwners(parts).map((part) => ({ value: part.id, label: part.name }))}
          onChange={(event) => routes.changeAnchor(index, { ...anchor, partId: event.target.value })}
        />
      </FieldRow>
      <div className="grid grid-cols-3 gap-2">
        {(['X', 'Y', 'Z'] as const).map((axis, coordinate) => (
          <NumberInput
            key={axis}
            label={axis}
            value={anchor.position[coordinate]}
            precision={3}
            onChange={(value, live) =>
              routes.changeAnchor(
                index,
                {
                  ...anchor,
                  position: anchor.position.map((entry, i) => (i === coordinate ? value : entry)) as [
                    number,
                    number,
                    number,
                  ],
                },
                live,
              )
            }
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="xs"
          aria-pressed={routes.placing === index}
          onClick={() => routes.place(index)}
        >
          Move Point
        </Button>
        <Button variant="danger" size="xs" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>
      <ConfirmDialog
        isOpen={confirming}
        title={`Delete ${name}?`}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          routes.remove(index);
        }}
      />
    </div>
  );
}
