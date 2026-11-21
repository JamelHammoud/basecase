import { sharedRepo, HUB_ORIGIN } from '../gallery/galleryLinks';

const LOCAL = /^\/l\/([a-z0-9][a-z0-9-]{0,79})\/?$/;
const HUB = /^\/l\/([^/]+)\/([^/]+)\/([a-f0-9]{40})\/?$/;
const SHIPPED = /^\/leagues\/[a-z0-9][a-z0-9-]{0,79}\/board\.json$/;
const REMOTE = /^\/datasets\/([^/]+)\/([^/]+)\/resolve\/([a-f0-9]{40})\/board\.json$/;
const TRUSTED_PUBLISHER = 'JamelHammoud/basecase-leagues';

export function leagueSource(path: string): string | null {
  const local = LOCAL.exec(path);

  if (local) return `/leagues/${local[1]}/board.json`;

  const match = HUB.exec(path);

  if (!match || !sharedRepo(`${match[1]}/${match[2]}`)) return null;

  return `${HUB_ORIGIN}/datasets/${match[1]}/${match[2]}/resolve/${match[3]}/board.json`;
}

export function leagueBoardSource(link: string): string | null {
  try {
    return leagueSource(new URL(link, 'https://basecase.so').pathname);
  } catch {
    return null;
  }
}

function remoteLeagueSource(source: string): string | null {
  try {
    const url = new URL(source);
    const match = REMOTE.exec(url.pathname);

    if (url.origin !== HUB_ORIGIN || url.search || url.hash || url.username || url.password || !match) return null;

    const repo = `${match[1]}/${match[2]}`;

    return sharedRepo(repo) ? repo : null;
  } catch {
    return null;
  }
}

export const shippedLeagueSource = (source: string) => SHIPPED.test(source);

export const allowedLeagueSource = (source: string) =>
  shippedLeagueSource(source) || remoteLeagueSource(source) !== null;

export const trustedLeagueSource = (source: string) =>
  shippedLeagueSource(source) || remoteLeagueSource(source) === TRUSTED_PUBLISHER;
