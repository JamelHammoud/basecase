import { VersionMergeChoices } from './VersionMergeChoices';
import { Button, Select } from '../design-system';
import { useVersionComparison, type VersionComparison } from './useVersionComparison';
import { VersionMeasurements } from './VersionMeasurements';
import type { WorkspaceCore } from './useWorkspaceCore';

function canMerge(compare: VersionComparison, busy: boolean, activeRuns: boolean) {
  return !!compare.compared?.result.merge?.scene && compare.selected.length > 0 && !busy && !activeRuns;
}

export function VersionComparisonPanel({ core }: { core: WorkspaceCore }) {
  const compare = useVersionComparison(core);
  const { versions } = core;
  const { compared } = compare;
  const merge = compared?.result.merge;
  const activeRuns = Object.keys(versions.view?.activeRuns ?? {}).length > 0;

  if (!compare.choices.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Select
          aria-label="Compare with"
          value={compare.picked}
          options={compare.choices.map((tab) => ({ value: tab.id, label: tab.name }))}
          onChange={(event) => compare.pick(event.target.value)}
        />
        <Button disabled={versions.busy} onClick={() => void versions.perform(compare.compare)}>
          Compare
        </Button>
      </div>
      {compared && <VersionMeasurements metrics={compared.metrics} kase={compared.kase} caseName={compared.caseName} />}
      <VersionMergeChoices
        compare={compare}
        versions={versions}
        sceneName={core.scene.sceneName}
        sourceName={core.studio.tabs.find((tab) => tab.id === compared?.target)?.name ?? ''}
      />
      {!!merge?.dangling.length && (
        <p role="alert" className="text-[13px] text-red-400">
          {merge.dangling.join(', ')}
        </p>
      )}
      {compared && !merge && <p className="text-[13px] text-white/50">Branch from a shared version to merge parts.</p>}
      {compared && (
        <Button
          disabled={!canMerge(compare, versions.busy, activeRuns)}
          onClick={() => void versions.perform(compare.merge)}
        >
          Merge Parts
        </Button>
      )}
    </div>
  );
}
