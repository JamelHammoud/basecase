import React from 'react';
import { formatDay, type Entry } from './siteContent';

export const EntryMeta: React.FC<{ entry: Entry }> = ({ entry }) => (
  <p className="flex flex-wrap gap-[12px] text-[13px] leading-[1.4] text-white/50 tabular-nums">
    <time dateTime={entry.date}>{formatDay(entry.date)}</time>
    {entry.version && <span>{entry.version}</span>}
  </p>
);
