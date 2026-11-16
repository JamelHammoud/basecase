import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Spinner } from '../design-system';
import { GalleryScene } from '../gallery/GalleryScene';
import type { GalleryBundle } from '../gallery/galleryBundle';
import { errorMessage } from '../utils/errorMessage';
import { fetchLeagueEntry, type LoadedLeague } from './boardLoader';
import type { LeagueEntry } from './types';
import { useLeagueReplay } from './useLeagueReplay';

type LoadedEntry = { bundle: GalleryBundle; bytes: Uint8Array };

function entrySeeds(league: LoadedLeague, entry: LeagueEntry) {
  const outcomes = league.frozen?.standings.find((row) => row.entryId === entry.id)?.outcomes ?? [];
  const seeds = outcomes.map((outcome) => outcome.seed);

  return {
    seeds: seeds.length ? seeds : [1],
    initial: outcomes.find((outcome) => !outcome.passed)?.seed ?? seeds[0] ?? 1,
  };
}

export function LeagueEntryReplay({
  league,
  entry,
  sceneContainer,
}: {
  league: LoadedLeague;
  entry: LeagueEntry;
  sceneContainer: HTMLElement | null;
}) {
  const [loaded, setLoaded] = useState<LoadedEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { seeds, initial } = entrySeeds(league, entry);
  const [seed, setSeed] = useState(initial);
  const replay = useLeagueReplay(entry.id);

  useEffect(() => {
    let live = true;

    void fetchLeagueEntry(league, entry).then(
      (value) => live && setLoaded(value),
      (reason) => live && setError(errorMessage(reason)),
    );

    return () => {
      live = false;
    };
  }, [league, entry]);

  return (
    <>
      {loaded &&
        sceneContainer &&
        createPortal(
          <GalleryScene bundle={loaded.bundle} Console={null} replay={replay.result?.replay} />,
          sceneContainer,
        )}
      <div className="relative z-10 flex flex-col gap-3">
        <h2 className="text-[15px] font-medium">Seed</h2>
        <div className="flex flex-wrap gap-2">
          {seeds.map((value) => (
            <Button key={value} variant={seed === value ? 'active' : 'secondary'} onClick={() => setSeed(value)}>
              {value}
            </Button>
          ))}
        </div>
        <Button
          disabled={!loaded || replay.busy}
          icon={replay.busy ? <Spinner /> : undefined}
          onClick={() => loaded && replay.run({ manifest: league.manifest, entry, bytes: loaded.bytes, seed })}
        >
          Replay Seed
        </Button>
        {replay.result && (
          <div className="flex flex-col gap-2" data-testid="league-replay-verdict">
            <h2 className="text-[15px] font-medium">Provisional replay</h2>
            <p className={replay.result.replay.passed ? 'text-white/60' : 'text-red-400'}>
              {replay.result.replay.passed ? 'Passed' : replay.result.failed.join(', ') || 'Failed'}
            </p>
          </div>
        )}
        {(error || replay.error) && <p className="text-[13px] text-red-400">{error || replay.error}</p>}
      </div>
    </>
  );
}
