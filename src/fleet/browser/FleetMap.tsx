import { useEffect, useRef, useState } from 'react';
import { Button } from '../../design-system';
import type { PreparedGeometry } from '../sites/facilityTypes';
import { createMapStage, type MapLabel } from './mapStage';
import type { RegistryItem } from './client';
import type { Registration } from '../sites/registration.mjs';

export function FleetMap({
  geometry,
  robots,
  onSelect,
  registration = null,
}: {
  geometry: PreparedGeometry | null;
  robots: RegistryItem[];
  onSelect: (id: string) => void;
  registration?: Registration | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<ReturnType<typeof createMapStage> | null>(null);
  const [labels, setLabels] = useState<MapLabel[]>([]);

  useEffect(() => {
    if (!container.current) return;

    const next = createMapStage({ container: container.current, geometry, labels: setLabels });

    stage.current = next;

    return () => {
      stage.current = null;
      next.dispose();
    };
  }, [geometry]);

  useEffect(() => stage.current?.update(robots, registration), [robots, geometry, registration]);

  return (
    <div
      className="relative h-[420px] overflow-hidden rounded-xl bg-[#1b1b1b]"
      data-testid={geometry ? 'fleet-facility' : 'fleet-globe'}
    >
      <div ref={container} className="absolute inset-0" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {labels.map((label) => (
          <line key={label.id} x1={label.anchorX} y1={label.anchorY} x2={label.x} y2={label.y + 16} stroke="#777777" />
        ))}
      </svg>
      {labels.map((label) => (
        <div key={label.id} className="absolute" style={{ left: label.x, top: label.y }}>
          <Button size="xs" className="max-w-[150px] truncate" onClick={() => onSelect(label.id)}>
            {label.name}
          </Button>
        </div>
      ))}
    </div>
  );
}
