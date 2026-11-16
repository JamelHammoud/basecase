import { describe, expect, it } from 'vitest';
import { allowedLeagueSource, leagueBoardSource, leagueSource, trustedLeagueSource } from './boardSource';

const revision = 'a'.repeat(40);

describe('League board sources', () => {
  it('selects local boards and immutable Hub revisions without loading the studio', () => {
    expect(leagueSource('/l/rover-sprint')).toBe('/leagues/rover-sprint/board.json');
    expect(leagueSource(`/l/JamelHammoud/basecase-leagues/${revision}`)).toBe(
      `https://huggingface.co/datasets/JamelHammoud/basecase-leagues/resolve/${revision}/board.json`,
    );
    expect(leagueBoardSource(`https://basecase.so/l/rover-sprint`)).toBe('/leagues/rover-sprint/board.json');
  });

  it.each(['/l/a/b/main', '/l/../board', '/l/a/b/' + 'a'.repeat(41), '/r/a/b'])('refuses %s', (path) => {
    expect(leagueSource(path)).toBeNull();
  });

  it('limits frozen standings to shipped boards and the trusted publisher', () => {
    expect(trustedLeagueSource('/leagues/rover-sprint/board.json')).toBe(true);
    expect(trustedLeagueSource(leagueSource(`/l/JamelHammoud/basecase-leagues/${revision}`)!)).toBe(true);
    expect(trustedLeagueSource(leagueSource(`/l/outsider/board/${revision}`)!)).toBe(false);
    expect(trustedLeagueSource('https://example.com/board.json')).toBe(false);
    expect(
      allowedLeagueSource(
        'https://huggingfaceXco/datasets/JamelHammoud/basecase-leagues/resolve/' + revision + '/board.json',
      ),
    ).toBe(false);
    expect(allowedLeagueSource('/leagues/../board.json')).toBe(false);
    expect(allowedLeagueSource(leagueSource(`/l/outsider/board/${revision}`)!)).toBe(true);
  });
});
