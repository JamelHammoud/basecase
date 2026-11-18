import { useState } from 'react';
import { Badge, Select } from '../../design-system';
import type { SourceInfo, SourceSnapshot } from '../../cases/comparison/comparisonJobs';
import { comparisonNumber } from './comparisonText';
import { MessageTreeRows } from '../caseRun/panels/MessageTreeRows';

interface MessagesProps {
  source: SourceInfo;
  snapshot: SourceSnapshot | undefined;
  topic: string;
  maxAge: number;
  onTopic: (topic: string) => void;
}

export function ComparisonMessages({ source, snapshot, topic, onTopic, maxAge }: MessagesProps) {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const flip = (path: string) =>
    setFlipped((previous) => {
      const next = new Set(previous);

      if (!next.delete(path)) next.add(path);

      return next;
    });

  if (!source.topics.length) return null;

  const at = snapshot?.message.at ?? null;
  const stale = at !== null && !!snapshot && snapshot.time - at > maxAge;

  return (
    <>
      <Select
        aria-label="Message"
        value={topic}
        options={source.topics.map((item) => ({ value: item.topic, label: item.topic }))}
        onChange={(event) => onTopic(event.target.value)}
      />
      {at !== null && <output className="text-[12px] text-white/60">{comparisonNumber(at)} s</output>}
      {stale && <span className="text-[13px] text-white/60">Stale sample</span>}
      {snapshot?.message.clipped && <Badge variant="amber">Clipped</Badge>}
      <div data-testid="comparison-message">
        <MessageTreeRows nodes={snapshot?.message.nodes ?? []} depth={0} path="" opening={{ flipped, flip }} />
      </div>
    </>
  );
}
