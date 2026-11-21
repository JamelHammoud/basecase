import { useEffect, useState } from 'react';
import { EmptyState, Spinner } from '../design-system';
import { errorMessage } from '../utils/errorMessage';
import { fetchLeagueBoard, type LoadedLeague } from './boardLoader';
import { LeagueBoard } from './LeagueBoard';

type LoadState = { kind: 'loading' } | { kind: 'ready'; league: LoadedLeague } | { kind: 'error'; message: string };

export function LeagueApp({ source }: { source: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let live = true;

    void fetchLeagueBoard(source).then(
      (league) => live && setState({ kind: 'ready', league }),
      (error) => live && setState({ kind: 'error', message: errorMessage(error) }),
    );

    return () => {
      live = false;
    };
  }, [source]);

  if (state.kind === 'ready') return <LeagueBoard league={state.league} />;

  return (
    <div className="fixed inset-0 bg-[#1b1b1b] text-white/90 flex items-center justify-center">
      {state.kind === 'error' ? <EmptyState title="League unavailable" description={state.message} /> : <Spinner />}
    </div>
  );
}
