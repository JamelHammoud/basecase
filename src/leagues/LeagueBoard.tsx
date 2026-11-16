import { useState } from 'react';
import { dayLabel } from '../utils/timeAgo';
import type { LoadedLeague } from './boardLoader';
import { LeagueEntryReplay } from './LeagueEntryReplay';
import { LeagueStandings } from './LeagueStandings';

export function LeagueBoard({ league }: { league: LoadedLeague }) {
  const first = league.frozen?.standings[0]?.entryId ?? league.entries[0]?.id ?? '';
  const [selected, setSelected] = useState(first);
  const [sceneContainer, setSceneContainer] = useState<HTMLDivElement | null>(null);
  const entry = league.entries.find((value) => value.id === selected);

  return (
    <div className="fixed inset-0 bg-[#1b1b1b] text-white/90">
      <div ref={setSceneContainer} className="absolute inset-0" />
      <aside className="absolute z-10 right-4 top-4 bottom-4 w-[min(480px,calc(100%-32px))] bg-[#1f1f1f] rounded-[12px] p-3 flex flex-col gap-4 overflow-y-auto">
        <header>
          <h1 className="text-[20px] font-semibold">{league.manifest.title}</h1>
          <p className="mt-2 text-[13px] text-white/60">{league.manifest.case.name}</p>
          <p className="mt-2 text-[12px] text-white/50">{dayLabel(league.manifest.deadline)}</p>
        </header>
        <h2 className="text-[15px] font-medium">{league.frozen ? 'Frozen standings' : 'Entries'}</h2>
        <LeagueStandings league={league} selected={selected} onSelect={setSelected} />
        {entry && <LeagueEntryReplay key={entry.id} league={league} entry={entry} sceneContainer={sceneContainer} />}
      </aside>
    </div>
  );
}
