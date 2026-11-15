import { ErrorBoundary } from '../design-system';
import FrameLabelEditor from '../components/visionLabels/FrameLabelEditor';
import { AddFramesSheet } from '../components/visionLabels/AddFramesSheet';
import type { FrameLabels } from './useFrameLabels';
import { prelabelFrameSet } from '../vision/prelabels';
import { useFrameSegmentation } from './useFrameSegmentation';

function LabelEditorHost({ labels }: { labels: FrameLabels }) {
  const segmentation = useFrameSegmentation();
  const editing = labels.editing;

  if (!editing) return null;

  return (
    <FrameLabelEditor
      key={`${editing.set.id}:${editing.revision ?? 0}`}
      set={editing.set}
      initialFrameId={editing.frameId}
      onChange={labels.change}
      onClose={labels.close}
      onPrelabel={prelabelFrameSet}
      onSegment={segmentation.segment}
      onTrack={segmentation.track}
    />
  );
}

export function FrameLabelsHost({ active, labels }: { active: boolean; labels: FrameLabels }) {
  if (!active) return null;

  return (
    <>
      {labels.adding && (
        <ErrorBoundary region="Add Frames" onClose={labels.cancel}>
          <AddFramesSheet labels={labels} />
        </ErrorBoundary>
      )}
      {labels.editing && (
        <ErrorBoundary region="Label Objects" onClose={labels.close}>
          <LabelEditorHost labels={labels} />
        </ErrorBoundary>
      )}
    </>
  );
}
