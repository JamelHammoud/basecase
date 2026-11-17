import type { InspectionNavigation } from '../../workspace/visionInspectionNavigation';
import { useInspectionNavigation } from './useInspectionNavigation';
import { useState } from 'react';
import { Button, Modal, Select, Spinner } from '../../design-system';

import { filterComparisonImages, type ComparisonImage, type InspectionFinding } from '../../vision/training/inspection';
import { VisionInspectionDetail } from './VisionInspectionDetail';
import { useVisionInspection, type VisionInspectionReports } from './useVisionInspection';
import { useConditionComparison } from './useConditionComparison';
import { VisionGroupFilter } from './VisionGroupFilter';
import type { ImageGroup } from '../../vision/training/conditionEvaluation';
import { sampleKey } from '../../vision/training/evaluationIdentity';

interface Props {
  reports: VisionInspectionReports;
  onClose: () => void;
  navigation?: InspectionNavigation;
}

const FINDINGS = [
  { value: 'all', label: 'All Findings' },
  { value: 'misses', label: 'Misses' },
  { value: 'false-positives', label: 'False Positives' },
  { value: 'improvements', label: 'Candidate Improvements' },
  { value: 'regressions', label: 'Candidate Regressions' },
];

export function VisionInspection({ reports, onClose, navigation }: Props) {
  const [classId, setClassId] = useState<number | null>(null);
  const [finding, setFinding] = useState<InspectionFinding>('all');
  const [selected, setSelected] = useState<ComparisonImage | null>(null);
  const [group, setGroup] = useState<ImageGroup | null>(null);
  const { index, loaded } = useVisionInspection(reports, selected);
  const actions = useInspectionNavigation({ navigation, onClose });
  const comparison = useConditionComparison(reports, index ? group : null);
  const images = filterComparisonImages(groupImages(index, group), { classId, finding });
  const task = reports.candidate.task;
  const rules = {
    detect:
      'Boxes match one label each by class, in confidence order, at IoU ≥ 0.50. Changes compare matching errors at IoU 0.50–0.95. Dataset mAP averages AP across those thresholds.',
    segment:
      'Masks match one label each by class, in confidence order, at IoU ≥ 0.50. Changes compare matching errors at IoU 0.50–0.95. Dataset mAP averages AP across those thresholds.',
    keypoints: `Boxes match one label each by class, in confidence order, at IoU ≥ 0.50. Visible points match within ${(task.keypointTolerance ?? 0.1) * 100}% of the labeled box diagonal. Changes compare missed visible points and object errors.`,
    classify: 'Classification uses the highest-scoring class. Changes compare misses and false positives.',
  };

  return (
    <Modal isOpen onClose={onClose} title="Comparison images" maxWidth="max-w-5xl">
      <div className="flex flex-col gap-3 text-[13px] text-white/90">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all">
          <dt>Candidate</dt>
          <dd>{reports.candidate.modelHash}</dd>
          <dt>Incumbent</dt>
          <dd>{reports.incumbent.modelHash}</dd>
          <dt>Test</dt>
          <dd>{reports.candidate.testHash}</dd>
        </dl>
        <details className="text-white/60">
          <summary>Matching rules</summary>
          <p>{rules[task.kind]}</p>
        </details>
        <div className="flex gap-2">
          <Select
            disabled={actions.busy}
            aria-label="Class"
            value={classId ?? 'all'}
            options={[
              { value: 'all', label: 'All Classes' },
              ...task.classes.map((category) => ({ value: String(category.id), label: category.name })),
            ]}
            onChange={(event) => {
              setClassId(event.target.value === 'all' ? null : Number(event.target.value));
              setSelected(null);
            }}
          />
          <Select
            disabled={actions.busy}
            aria-label="Finding"
            value={finding}
            options={FINDINGS}
            onChange={(event) => {
              setFinding(event.target.value as InspectionFinding);
              setSelected(null);
            }}
          />
        </div>
        <VisionGroupFilter
          metric={task.metric}
          classId={classId}
          index={index}
          group={group}
          comparison={comparison}
          onChange={(next) => {
            setGroup(next);
            setSelected(null);
          }}
        />
        {!index && <Spinner />}
        {index?.problem && <p role="status">{index.problem}</p>}
        <div className="grid grid-cols-[220px_1fr] gap-3">
          <div className="flex flex-col gap-1 max-h-[440px] overflow-y-auto">
            {images.map((image) => (
              <Button
                key={`${image.candidate.sample.frameSetId}:${image.candidate.sample.frameId}`}
                disabled={actions.busy}
                variant={selected === image ? 'active' : 'ghost'}
                onClick={() => setSelected(image)}
              >
                {image.candidate.sample.frameId}
              </Button>
            ))}
            {index && !index.problem && !images.length && <p role="status">No matches</p>}
          </div>
          <VisionInspectionDetail
            selected={selected}
            loaded={loaded}
            task={task}
            classId={classId}
            actions={navigation ? actions : undefined}
          />
        </div>
      </div>
    </Modal>
  );
}

function groupImages(index: ReturnType<typeof useVisionInspection>['index'], group: ImageGroup | null) {
  if (!group) return index?.images ?? [];

  const membership = index?.groups.find((item) => item.kind === group.kind && item.name === group.name);
  const keys = new Set(membership?.keys ?? []);

  return index?.images.filter((image) => keys.has(sampleKey(image.candidate.sample))) ?? [];
}
