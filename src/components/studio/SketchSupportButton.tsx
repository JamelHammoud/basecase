import { Button } from '../../design-system';
import type { BoundSketch } from './SketchPanel';

export function SketchSupportButton({ bound }: { bound: BoundSketch | null }) {
  if (!bound?.record.support || !bound.onSelectFace) return null;

  return <Button onClick={bound.onSelectFace}>Select Face</Button>;
}
