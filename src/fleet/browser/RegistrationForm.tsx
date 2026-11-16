import { useState } from 'react';
import { Button, Select, TextInput } from '../../design-system';
import { registerControls, type Registration } from '../sites/registration.mjs';
import { fleetRequest } from './client';

const LABELS = ['Local east (m)', 'Local north (m)', 'Local up (m)', 'Latitude', 'Longitude', 'Altitude (m)'];

export function RegistrationForm({
  path,
  facility,
  registration,
  onSaved,
}: {
  path: string;
  facility: string;
  registration: Registration | null;
  onSaved: (value: Registration) => void;
}) {
  const [values, setValues] = useState(
    () =>
      registration?.controls.map((point) =>
        [...point.local, point.latitude, point.longitude, point.altitudeM].map(String),
      ) ?? [Array(6).fill(''), Array(6).fill('')],
  );
  const [kind, setKind] = useState(registration?.vertical.kind ?? 'ellipsoid');
  const [offset, setOffset] = useState(String(registration?.vertical.offsetM ?? ''));
  const [reference, setReference] = useState(registration?.vertical.reference ?? '');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateCell(point: number, index: number, value: string) {
    setValues((previous) =>
      previous.map((row, rowIndex) =>
        rowIndex === point ? row.map((cell, column) => (column === index ? value : cell)) : row,
      ),
    );
  }

  async function save() {
    setSaving(true);
    setError(false);

    try {
      if (values.flat().some((value) => !value.trim())) throw new Error('Enter two control points');

      if (kind !== 'ellipsoid' && (!offset.trim() || !reference.trim()))
        throw new Error('Declare the vertical reference and offset');

      const value = registerControls({
        datum: 'WGS84',
        vertical: { kind, offsetM: Number(offset), reference },
        controls: values.map((row) => ({
          local: row.slice(0, 3).map(Number),
          latitude: Number(row[3]),
          longitude: Number(row[4]),
          altitudeM: Number(row[5]),
        })),
      });
      const saved = await fleetRequest<{ registration: Registration }>(`${path}/registration`, {
        method: 'PUT',
        body: JSON.stringify({ ...value, facility }),
      });

      onSaved(saved.registration);
    } catch {
      setError(true);
    }

    setSaving(false);
  }

  return (
    <details open={!registration} className="space-y-3">
      <summary className="cursor-pointer py-2">Site registration</summary>
      <p className="text-white/60">
        WGS84 control points in facility meters. Altitudes use the declared vertical frame.
      </p>
      <Select
        aria-label="Vertical frame"
        value={kind}
        onChange={(event) => setKind(event.target.value as typeof kind)}
        options={[
          { value: 'ellipsoid', label: 'WGS84 ellipsoid' },
          { value: 'orthometric', label: 'Orthometric height' },
          { value: 'local', label: 'Local vertical datum' },
        ]}
      />
      {kind !== 'ellipsoid' && (
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            aria-label="Vertical reference"
            placeholder="EGM2008"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
          <TextInput
            aria-label="Offset to ellipsoid (m)"
            placeholder="30.2"
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
          />
        </div>
      )}
      {values.map((row, pointIndex) => (
        <fieldset key={pointIndex} className="grid grid-cols-3 gap-3">
          <legend className="mb-2">{pointIndex === 0 ? 'Control point 1' : 'Control point 2'}</legend>
          {LABELS.map((label, index) => (
            <label key={label} className="space-y-1 text-[12px] text-white/60">
              {label}
              <TextInput
                aria-label={`${label} ${pointIndex + 1}`}
                value={row[index]}
                onChange={(event) => updateCell(pointIndex, index, event.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="text-red-400">
          Check control points, units and vertical frame
        </p>
      )}
      <Button disabled={saving} onClick={() => void save()}>
        Register Site
      </Button>
    </details>
  );
}
