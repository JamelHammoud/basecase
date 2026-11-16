import { titleCase } from '../utils/titleCase';
import { Select, Switch } from '../design-system';
import type { VersionComparison } from './useVersionComparison';
import type { SceneVersions } from './useSceneVersions';

export function VersionMergeChoices({
  compare,
  versions,
  sceneName,
  sourceName,
}: {
  compare: VersionComparison;
  versions: SceneVersions;
  sceneName: string;
  sourceName: string;
}) {
  const { compared } = compare;

  if (!compared) return null;

  const comparison = compared.result.comparison;
  const choices = [
    ...comparison.parts.map((part) => ({ ...part, key: `part:${part.id}` })),
    ...comparison.joints.map((joint) => ({ ...joint, key: `joint:${joint.id}` })),
  ];

  return (
    <>
      {choices.map((part) => (
        <div key={part.key} className="flex items-center gap-3">
          <span className="flex-1 text-[13px] text-white/60">{part.change}</span>
          <Switch
            label={part.name}
            aria-label={part.name}
            checked={compare.selected.includes(part.key)}
            disabled={versions.busy || !compared.result.merge}
            onChange={(enabled) => void versions.perform(() => compare.select(part.key, enabled))}
          />
        </div>
      ))}
      {!!compared.result.merge &&
        compared.result.merge.dependencies.some((entry) => !compare.selected.includes(entry.key)) && (
          <div className="flex flex-col gap-1 text-[13px] text-white/60">
            <span>Dependencies</span>
            {compared.result.merge.dependencies
              .filter((entry) => !compare.selected.includes(entry.key))
              .map((entry) => (
                <span key={entry.key}>{titleCase(entry.name)}</span>
              ))}
          </div>
        )}
      {compared.conflictKeys.map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <span className="text-[13px] text-amber-400">
            {compared.result.merge?.dependencies.find((entry) => entry.key === key)?.name ?? key}
          </span>
          <Select
            aria-label={key}
            value={compare.resolutions[key] ?? ''}
            options={[
              { value: '', label: 'Choose a Design' },
              { value: 'current', label: sceneName },
              { value: 'incoming', label: sourceName },
            ]}
            onChange={(event) => {
              const choice = event.target.value;

              if (choice === 'current' || choice === 'incoming')
                void versions.perform(() => compare.resolve(key, choice));
            }}
          />
        </div>
      ))}
    </>
  );
}
