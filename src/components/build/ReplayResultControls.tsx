import { Button } from '../../design-system';
import type { PowerReplayRecord } from '../../wiring/powerReplayTypes';

export function ReplayResultControls({
  record,
  sample,
  onSelectParts,
}: {
  record: PowerReplayRecord;
  sample: number;
  onSelectParts: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {record.result.segments.map((segment) => (
        <Button
          key={segment.id}
          variant="ghost"
          disabled={!segment.partIds.length}
          onClick={() => onSelectParts(segment.partIds)}
        >
          {segment.name}: {segment.amps[sample]?.toFixed(3)} A / {segment.lossW[sample]?.toFixed(3)} W
        </Button>
      ))}
    </div>
  );
}
