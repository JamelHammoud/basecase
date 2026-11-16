import { useRef, useState } from 'react';
import { Button, Select, TextInput } from '../../design-system';
import type { FacilityOptions } from '../sites/facilityTypes';

export function FacilityUpload({
  busy,
  onUpload,
}: {
  busy: boolean;
  onUpload: (files: File[], options: FacilityOptions, floors: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [units, setUnits] = useState<FacilityOptions['units']>('m');
  const [up, setUp] = useState<FacilityOptions['up']>('Z');
  const [root, setRoot] = useState('');
  const [floors, setFloors] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        aria-label="Source units"
        value={units}
        onChange={(event) => setUnits(event.target.value as typeof units)}
        options={[
          { value: 'm', label: 'Meters' },
          { value: 'mm', label: 'Millimeters' },
          { value: 'cm', label: 'Centimeters' },
        ]}
      />
      <Select
        aria-label="Source up axis"
        value={up}
        onChange={(event) => setUp(event.target.value as typeof up)}
        options={[
          { value: 'Z', label: 'Z up' },
          { value: 'Y', label: 'Y up' },
        ]}
      />
      <div className="max-w-[200px]">
        <TextInput
          aria-label="Root file"
          placeholder="facility.usda"
          value={root}
          onChange={(event) => setRoot(event.target.value)}
        />
      </div>
      <div className="max-w-[240px]">
        <TextInput
          aria-label="Floor identities"
          placeholder="Ground, Level 2, Roof"
          value={floors}
          onChange={(event) => setFloors(event.target.value)}
        />
      </div>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        aria-label="Facility files"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);

          event.target.value = '';
          onUpload(
            files,
            { units, up, root: root.trim() || undefined },
            floors
              .split(',')
              .map((floor) => floor.trim())
              .filter(Boolean),
          );
        }}
      />
      <Button disabled={busy} onClick={() => input.current?.click()}>
        Upload Facility
      </Button>
    </div>
  );
}
