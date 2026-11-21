import { TextureFileField } from './TextureFileField';
import { FieldRow, NumberInput, Select } from '../../design-system';
import type { Appearance, AppearanceEdit } from '../../appearance/model';
import { mixedAppearanceOption, sharedAppearanceValue as shared } from './appearanceSelection';

interface Props {
  appearances: Appearance[];
  uvSupported: boolean;
  onChange: (patch: AppearanceEdit, live?: boolean) => void;
  onFile: (slot: keyof NonNullable<Appearance['textures']>, file: File) => void;
  disabled: boolean;
}

export const TextureControls = ({ appearances, uvSupported, onChange, onFile, disabled }: Props) => {
  const mapping = shared(appearances.map(({ mapping }) => (mapping.kind === 'uv' ? 'uv' : mapping.plane)));
  const normalY = shared(appearances.map((appearance) => appearance.normalY));
  const usesNormal = appearances.some((appearance) => appearance.textures?.normal);
  const updateMapping = (patch: Partial<Appearance['mapping']>, live?: boolean) => onChange({ mapping: patch }, live);

  return (
    <>
      {(['baseColor', 'normal', 'roughnessMetalness'] as const).map((slot) => (
        <TextureFileField
          key={slot}
          label={{ baseColor: 'Base color', normal: 'Normal', roughnessMetalness: 'Rough / metal' }[slot]}
          name={
            {
              baseColor: 'Base color texture',
              normal: 'Normal texture',
              roughnessMetalness: 'Roughness / metalness texture',
            }[slot]
          }
          loaded={appearances.some((appearance) => appearance.textures?.[slot])}
          disabled={disabled}
          onFile={(file) => onFile(slot, file)}
          onRemove={() => onChange({ textures: { [slot]: undefined } })}
        />
      ))}
      <Select
        aria-label="Texture mapping"
        value={mapping ?? 'mixed'}
        options={[
          ...(mapping === null ? [mixedAppearanceOption] : []),
          { value: 'uv', label: 'Mesh UVs', disabled: !uvSupported },
          { value: 'xy', label: 'Front Projection' },
          { value: 'xz', label: 'Top Projection' },
          { value: 'yz', label: 'Side Projection' },
        ]}
        onChange={(event) =>
          updateMapping(
            event.target.value === 'uv'
              ? { kind: 'uv' }
              : { kind: 'planar', plane: event.target.value as Appearance['mapping']['plane'] },
          )
        }
      />
      <FieldRow label="Scale">
        <NumberInput
          aria-label="Texture scale"
          value={shared(appearances.map(({ mapping }) => mapping.scale))}
          min={0.01}
          max={100000}
          step={1}
          precision={2}
          unit={mapping === null || mapping === 'uv' ? '' : 'mm'}
          onChange={(scale, live) => updateMapping({ scale }, live)}
        />
      </FieldRow>
      <FieldRow label="Rotation">
        <NumberInput
          aria-label="Texture rotation"
          value={shared(appearances.map(({ mapping }) => mapping.rotation))}
          min={-360}
          max={360}
          step={1}
          unit="°"
          onChange={(rotation, live) => updateMapping({ rotation }, live)}
        />
      </FieldRow>
      {usesNormal && (
        <Select
          aria-label="Normal orientation"
          value={normalY === null ? 'mixed' : String(normalY)}
          options={[
            ...(normalY === null ? [mixedAppearanceOption] : []),
            { value: '1', label: 'OpenGL (+Y)' },
            { value: '-1', label: 'DirectX (−Y)' },
          ]}
          onChange={(event) => onChange({ normalY: event.target.value === '1' ? 1 : -1 })}
        />
      )}
    </>
  );
};
