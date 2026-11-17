import type { TrainingMetric } from '../../vision/training/types';
import { Select } from '../../design-system';
import type { ImageGroup, ImageGroupSupport } from '../../vision/training/conditionEvaluation';
import { plural } from '../../../electron/plural.mjs';
import { VisionConditionResults } from './VisionConditionResults';
import type { ConditionComparison } from './useConditionComparison';

export function VisionGroupFilter({
  index,
  metric,
  classId,
  group,
  comparison,
  onChange,
}: {
  metric: TrainingMetric;
  classId: number | null;
  index: { groups: ImageGroupSupport[]; unlabeled: number; problem?: string } | null;
  group: ImageGroup | null;
  comparison: { result?: ConditionComparison; problem?: string } | null;
  onChange: (group: ImageGroup | null) => void;
}) {
  if (!index || index.problem) return null;

  if (!index.groups.length) return <p role="status">Condition comparison is unavailable for this saved evidence.</p>;

  const names = { condition: 'Condition', camera: 'Camera', source: 'Source' };

  return (
    <>
      <Select
        aria-label="Group"
        value={JSON.stringify(group)}
        options={[
          { value: 'null', label: 'All Images' },
          ...index.groups.map((item) => ({
            value: JSON.stringify({ kind: item.kind, name: item.name }),
            label: `${names[item.kind]}: ${item.name}`,
          })),
        ]}
        onChange={(event) => onChange(JSON.parse(event.target.value) as ImageGroup | null)}
      />
      <p className="text-white/60">
        {plural(index.unlabeled, 'image without a condition', 'images without a condition')}
      </p>
      {group && <VisionConditionResults comparison={comparison} metric={metric} classId={classId} />}
    </>
  );
}
