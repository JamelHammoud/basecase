import { useTextureImport } from './useTextureImport';
import { supportsMeshUvs } from './mappingSupport';
import { useComponentMeshVersion } from '../../three/componentMeshes';
import { Button, FieldRow, NumberInput, Select } from '../../design-system';
import { appearanceOf, FINISHES, applyFinish, type AppearanceEdit, editAppearance } from '../../appearance/model';
import { getTextureAsset } from '../../cases/worldAssets';
import type { ScenePart } from '../../types/robotics';
import { TextureControls } from './TextureControls';

interface Props {
  parts: ScenePart[];
  sceneParts: ScenePart[];
  baselineParts?: ScenePart[];
  onChange: (patch: Partial<ScenePart> | ((part: ScenePart) => Partial<ScenePart>), live?: boolean) => void;
}

export const FinishControls = ({ parts, sceneParts, baselineParts, onChange }: Props) => {
  useComponentMeshVersion();

  const base = appearanceOf(parts[0]);
  const texture = useTextureImport({ parts, sceneParts, baselineParts });
  const change = (patch: AppearanceEdit, live?: boolean) =>
    onChange((part) => ({ appearance: editAppearance(part, patch) }), live);
  const finish = parts[0].appearance
    ? (FINISHES.find(
        (f) => f.roughness === base.roughness && f.metalness === base.metalness && f.opacity === base.opacity,
      )?.value ?? 'custom')
    : '';
  const mixed = parts.some((part) => JSON.stringify(part.appearance) !== JSON.stringify(parts[0].appearance));
  const uvSupported = parts.every(supportsMeshUvs);
  const unsupportedUv = base.mapping.kind === 'uv' && !uvSupported;
  const missing = Object.values(base.textures ?? {}).some((hash) => !getTextureAsset(hash));

  return (
    <>
      <Select
        aria-label="Finish"
        value={mixed ? 'mixed' : finish}
        options={[
          { value: '', label: 'Original' },
          ...FINISHES,
          { value: 'custom', label: 'Custom', disabled: true },
          ...(mixed ? [{ value: 'mixed', label: 'Mixed', disabled: true }] : []),
        ]}
        onChange={(event) => {
          const finish = event.target.value;

          if (finish === 'custom' || finish === 'mixed') return;

          onChange((part) => applyFinish(part, finish));
        }}
      />
      {parts[0].appearance && (
        <>
          {(['roughness', 'metalness', 'opacity'] as const).map((key) => (
            <FieldRow key={key} label={{ roughness: 'Roughness', metalness: 'Metalness', opacity: 'Opacity' }[key]}>
              <NumberInput
                aria-label={{ roughness: 'Roughness', metalness: 'Metalness', opacity: 'Opacity' }[key]}
                value={new Set(parts.map((part) => appearanceOf(part)[key])).size > 1 ? null : base[key]}
                min={0}
                max={1}
                step={0.01}
                precision={2}
                unit=""
                onChange={(value, live) => change({ [key]: value }, live)}
              />
            </FieldRow>
          ))}
          <TextureControls
            appearance={base}
            uvSupported={uvSupported}
            onChange={change}
            onFile={(slot, file) => {
              void texture.load(slot, file, (hash) => change({ textures: { [slot]: hash } }));
            }}
            disabled={texture.loading}
          />
          {unsupportedUv && <p className="text-[12px] text-white/50">UV mapping needs mesh UVs.</p>}
          {missing && <p className="text-[12px] text-white/50">Texture missing.</p>}
          {texture.error && (
            <p role="alert" className="text-[12px] text-red-400">
              {texture.error}
            </p>
          )}
          {texture.loading && (
            <Button size="sm" onClick={texture.cancel}>
              Cancel
            </Button>
          )}
        </>
      )}
    </>
  );
};
