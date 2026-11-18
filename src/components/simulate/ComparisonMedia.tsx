import type { SavedTimeline } from '../../workspace/useSavedTimeline';
import { ComparisonCamera } from './ComparisonCamera';
import { ComparisonSpatialPreview } from './ComparisonSpatialPreview';

export interface ComparisonMediaProps {
  saved: SavedTimeline;
  index: number;
  maxAge: number;
}

export function ComparisonMedia(props: ComparisonMediaProps) {
  const source = props.saved.sources[props.index];

  return (
    <>
      {source.cameras.length > 0 && <ComparisonCamera {...props} />}
      {source.spatial.length > 0 && <ComparisonSpatialPreview {...props} />}
    </>
  );
}
