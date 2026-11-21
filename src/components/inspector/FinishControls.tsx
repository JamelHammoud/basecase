import { useTextureImport } from './useTextureImport';
import { supportsMeshUvs } from './mappingSupport';
import { useComponentMeshVersion } from '../../three/componentMeshes';
import { Button, FieldRow, NumberInput, Select, Spinner } from '../../design-system';
import { appearanceOf, FINISHES, applyFinish, type AppearanceEdit, editAppearance } from '../../appearance/model';
import { getTextureAsset } from '../../cases/worldAssets';
import type { ScenePart } from '../../types/robotics';
import { TextureControls } from './TextureControls';
import { mixedAppearanceOption, sharedAppearanceValue } from './appearanceSelection';

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
  const appearances = parts.map(appearanceOf);
  const mixed = parts.some(
    (part, index) =>
      Boolean(part.appearance) !== Boolean(parts[0].appearance) ||
      (['roughness', 'metalness', 'opacity'] as const).some((key) => appearances[index][key] !== base[key]),
  );
  const uvSupported = parts.every(supportsMeshUvs);
  const unsupportedUv = parts.some((part) => appearanceOf(part).mapping.kind === 'uv' && !supportsMeshUvs(part));
  const missing = appearances.some((appearance) =>
    Object.values(appearance.textures ?? {}).some((hash) => !getTextureAsset(hash)),
  );

  return (
    <>
      <Select
        aria-label="Finish"
        value={mixed ? 'mixed' : finish}
        options={[
          { value: '', label: 'Original' },
          ...FINISHES,
          { value: 'custom', label: 'Custom', disabled: true },
          ...(mixed ? [mixedAppearanceOption] : []),
        ]}
        onChange={(event) => {
          const finish = event.target.value;

          if (finish === 'custom' || finish === 'mixed') return;

          onChange((part) => applyFinish(part, finish));
        }}
      />
      {parts.some((part) => part.appearance) && (
        <>
          {(['roughness', 'metalness', 'opacity'] as const).map((key) => (
            <FieldRow key={key} label={{ roughness: 'Roughness', metalness: 'Metalness', opacity: 'Opacity' }[key]}>
              <NumberInput
                aria-label={{ roughness: 'Roughness', metalness: 'Metalness', opacity: 'Opacity' }[key]}
                value={sharedAppearanceValue(appearances.map((appearance) => appearance[key]))}
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
            appearances={appearances}
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
            <Button size="sm" icon={<Spinner />} onClick={texture.cancel}>
              Cancel
            </Button>
          )}
        </>
      )}
    </>
  );
};
