import { Button } from '../design-system';
import { negative } from '../../electron/minus.mjs';
import { useMoney } from '../utils/useMoney';
import type { LoadedLeague } from './boardLoader';

const figures = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });

export function LeagueStandings({
  league,
  selected,
  onSelect,
}: {
  league: LoadedLeague;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const money = useMoney();
  const entries =
    league.frozen?.standings.map((row) => league.entries.find((entry) => entry.id === row.entryId)!) ?? league.entries;

  return (
    <table className="w-full text-[13px] tabular border-collapse">
      <thead className="text-white/60 text-left">
        <tr>
          <th className="py-3 font-medium">Robot</th>
          <th className="py-3 font-medium text-right">Passes</th>
          <th className="py-3 font-medium text-right">Score</th>
          <th className="py-3 font-medium text-right">Budget</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const row = league.frozen?.standings.find((standing) => standing.entryId === entry.id);

          return (
            <tr key={entry.id} className="border-t border-white/[0.06]">
              <td className="py-2 pr-2">
                <Button variant={selected === entry.id ? 'active' : 'ghost'} onClick={() => onSelect(entry.id)}>
                  {entry.robotName ?? entry.id}
                </Button>
              </td>
              <td className="text-right">{row ? `${row.passes}/${row.outcomes.length}` : 'Unmeasured'}</td>
              <td className="text-right">
                {row ? negative(row.score, (value) => figures.format(value)) : 'Unmeasured'}
              </td>
              <td className="text-right">{row?.budget === null || !row ? 'Unpriced' : money.format(row.budget)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
