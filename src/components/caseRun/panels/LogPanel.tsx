import React, { useEffect, useRef, useState } from 'react';
import { NoMatches, SearchField, SegmentedControl } from '../../../design-system';
import { LOG_LEVELS, logEntries, type LogEntry, type LogLevel } from '../../../topics/logs';
import { useBus, type PanelContext, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { entriesUntil, LOG_TONES, secondsText } from './topicRows';

const LEVEL_OPTIONS = LOG_LEVELS.map((level) => ({ value: level, label: level }));

const LogRow: React.FC<{ entry: LogEntry; seek: PanelContext['seek'] }> = ({ entry, seek }) => (
  <button
    type="button"
    data-testid="log-entry"
    data-level={entry.level}
    onClick={() => seek?.(entry.at)}
    className="w-full min-h-[32px] px-[8px] py-[7px] flex items-start gap-2 rounded-[8px] text-left text-[13px] leading-[18px] cursor-default hover:bg-white/[0.04]"
  >
    <span className="shrink-0 w-[56px] text-right tabular-nums text-white/50">{secondsText(entry.at)}</span>
    <span className={`shrink-0 w-[40px] ${LOG_TONES[entry.level]}`}>{entry.level}</span>
    <span className="min-w-0 flex-1 break-words">
      {entry.name && <span className="text-white/60">{entry.name} </span>}
      <span className="text-white/90">{entry.text}</span>
    </span>
  </button>
);

export const LogPanel: React.FC<PanelViewProps<'log'>> = ({ panel, ctx }) => {
  const bus = useBus(ctx.bus);
  const [level, setLevel] = useState<LogLevel>(panel.level ?? 'debug');
  const [search, setSearch] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const index = bus.topics?.() ?? null;
  const head = bus.playhead();
  const all = index ? logEntries(index, { topics: panel.topics, level, search }) : [];
  const shown = head ? entriesUntil(all, head.at) : [];
  const newest = shown.at(-1);

  useEffect(() => {
    const el = scroller.current;

    if (el) el.scrollTop = el.scrollHeight;
  }, [newest, shown.length]);

  if (!index || !head) return null;

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;

    if (search) setSearch('');
    else e.currentTarget.blur();
  };

  return (
    <Titled title={panel.title}>
      <div className="flex flex-col gap-2" data-testid="log">
        <SearchField
          value={search}
          onChange={setSearch}
          onKeyDown={onSearchKey}
          placeholder="Search log"
          aria-label="Search log"
        />
        <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={setLevel} size="sm" />
        {search.trim() && !shown.length ? (
          <NoMatches query={search} />
        ) : (
          <div ref={scroller} className="max-h-[280px] overflow-y-auto">
            {shown.map((entry, i) => (
              <LogRow key={`${entry.topic}:${entry.at}:${i}`} entry={entry} seek={ctx.seek} />
            ))}
          </div>
        )}
      </div>
    </Titled>
  );
};
