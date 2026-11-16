import { readHubBytes, COMMIT } from './skillDownloads.mjs';

const HUB = 'https://huggingface.co';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DOWNLOAD_HOSTS = new Set([
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.hf.co',
  'cdn-lfs-eu-1.hf.co',
  'cas-bridge.xethub.hf.co',
]);

function checkedRedirect(location: string, previous: URL) {
  const url = new URL(location, previous);

  if (url.username || url.password || url.protocol !== 'https:' || !!url.port || !DOWNLOAD_HOSTS.has(url.hostname))
    throw new Error('Hugging Face sent an address that isn’t https.');

  return url;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

export class AnonymousHubClient {
  readonly origin: string;

  constructor(endpoint = HUB) {
    const url = new URL(endpoint);

    if (url.origin !== HUB && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname)))
      throw new Error('A Hugging Face request left huggingface.co.');

    this.origin = url.origin;
  }

  url(path: string) {
    const url = new URL(path, this.origin);

    if (url.origin !== this.origin || url.username || url.password)
      throw new Error('A Hugging Face request left huggingface.co.');

    return url;
  }

  async api(path: string) {
    const response = await fetch(this.url(path), {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) throw new Error('Couldn’t download the skill.');

    return response;
  }

  async revisionSha(repo: string, revision: string) {
    const response = await this.api(`/api/models/${repo}/revision/${encodeURIComponent(revision)}`);
    const info = JSON.parse(
      new TextDecoder().decode(await readHubBytes(response, 2 * 1024 * 1024, 'Hub skill search')),
    );

    if (typeof info.sha !== 'string' || !COMMIT.test(info.sha))
      throw new Error('Hugging Face didn’t name a commit for that revision.');

    return info.sha as string;
  }

  async download(path: string, { maxBytes, label }: { maxBytes: number; label: string }) {
    const pinned = /^\/([^/]+\/[^/]+)\/resolve\/([a-f0-9]{40})\/([^/]+)$/.exec(path);
    const cachePath =
      this.origin === HUB && pinned ? `/api/resolve-cache/models/${pinned[1]}/${pinned[2]}/${pinned[3]}` : path;
    let url = this.url(cachePath);

    for (let hop = 0; hop <= 3; hop += 1) {
      const response = await fetch(url, {
        credentials: 'omit',
        redirect: 'manual',
        signal: AbortSignal.timeout(120000),
      });
      const location = response.headers.get('location');

      if (REDIRECT.has(response.status) && location) {
        await response.body?.cancel();
        url = checkedRedirect(location, url);

        continue;
      }

      if (!response.ok) throw new Error('Couldn’t download the skill.');

      const commit = response.headers.get('x-repo-commit');

      if (pinned && commit && commit !== pinned[2])
        throw new Error('Hugging Face didn’t name a commit for that revision.');

      return readHubBytes(response, maxBytes, label);
    }

    throw new Error('Hugging Face sent too many redirects.');
  }
}
