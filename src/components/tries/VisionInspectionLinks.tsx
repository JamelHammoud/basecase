import { Button } from '../../design-system';
import type { ComparisonImage } from '../../vision/training/inspection';
import type { useInspectionNavigation } from './useInspectionNavigation';
import type { useVisionInspection } from './useVisionInspection';

interface Props {
  selected: ComparisonImage | null;
  loaded: ReturnType<typeof useVisionInspection>['loaded'];
  actions?: ReturnType<typeof useInspectionNavigation>;
}

export function VisionInspectionLinks({ selected, loaded, actions }: Props) {
  const frame = loaded?.image?.set.frames[0];

  if (!frame || !actions || !selected) return null;

  return (
    <>
      <div className="flex gap-2">
        <Button
          disabled={actions.busy}
          onClick={() => void actions.open('original', selected.candidate.sample, loaded.image?.originalClasses)}
        >
          Open Original Image
        </Button>
        {frame.origin && (
          <Button disabled={actions.busy} onClick={() => void actions.open('source', frame)}>
            Open Source Try
          </Button>
        )}
      </div>
      {actions.problem && <p role="status">{actions.problem}</p>}
    </>
  );
}
