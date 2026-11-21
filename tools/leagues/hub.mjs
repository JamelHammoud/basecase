import { checkedName } from '../../electron/hub/publishRepo.mjs';
import { HubClient } from '../../electron/hub/hubClient.mjs';

export const ISSUER = 'JamelHammoud/basecase-leagues';
export const client = () => new HubClient({ token: null });

export function pinnedRef(text) {
  const [repo, revision, extra] = String(text).split('@');
  const pieces = repo.split('/');

  if (extra || pieces.length !== 2 || !/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Use owner/repo@commit.');

  return { repo: pieces.map(checkedName).join('/'), revision };
}

export async function pinnedBytes(ref, file, maxBytes) {
  if (!/^[a-z0-9.-]+$/.test(file)) throw new Error('Unsupported League file.');

  return client().download(`/datasets/${ref.repo}/resolve/${ref.revision}/${file}`, { maxBytes, label: file });
}

export async function pinnedJson(ref, file) {
  return JSON.parse((await pinnedBytes(ref, file, 2 * 1024 * 1024)).toString('utf-8'));
}

export async function issuerBoard(text) {
  const ref = pinnedRef(text);

  if (ref.repo !== ISSUER) throw new Error('Use the League publisher’s repo.');

  return pinnedJson(ref, 'board.json');
}

export async function currentIssuerBoard(text) {
  const pinned = await issuerBoard(text);
  const info = await (await client().api(`/api/datasets/${ISSUER}/revision/main`)).json();
  const current = await issuerBoard(`${ISSUER}@${info.sha}`);
  const { hashValue } = await import('./runtime.mjs').then((runtime) => runtime.leagueModule('validation'));

  if (hashValue(pinned.manifest) !== hashValue(current.manifest)) throw new Error('The League manifest changed.');

  return { board: current, revision: info.sha };
}
