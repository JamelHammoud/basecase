import { afterEach, expect, it, vi } from 'vitest';
import { githubTree, repoLink } from './github';
import { hubLink, hubTree } from './hub';
import { fetchBytes, TooLargeError, urlResolver } from './sources';

afterEach(() => vi.unstubAllGlobals());

function oversized(bytes: number) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });

  return { response: new Response(body, { headers: { 'content-length': String(bytes) } }), cancel };
}

it('refuses direct descriptions and companion files above 200 MiB and cancels their bodies', async () => {
  const description = oversized(200 * 1024 * 1024 + 1);

  vi.stubGlobal('fetch', async () => description.response);
  await expect(urlResolver('https://example.com/robot.urdf')).rejects.toThrow('Couldn’t download');
  expect(description.cancel).toHaveBeenCalledOnce();

  const mesh = oversized(200 * 1024 * 1024 + 1);

  vi.stubGlobal('fetch', async (url: string) =>
    url.endsWith('.urdf') ? new Response('<robot name="arm"/>') : mesh.response,
  );

  const resolver = await urlResolver('https://example.com/robot.urdf');

  await expect(resolver.read('mesh.stl')).resolves.toBeNull();
  expect(mesh.cancel).toHaveBeenCalledOnce();
});

it.each(['GitHub', 'Hugging Face'])('caps %s tree file reads at 200 MiB', async (provider) => {
  const mesh = oversized(200 * 1024 * 1024 + 1);
  const github = provider === 'GitHub';
  const url = github ? 'https://github.com/me/arm' : 'https://huggingface.co/me/arm';
  const listing = github ? { tree: [{ path: 'mesh.stl', type: 'blob' }] } : [{ path: 'mesh.stl', type: 'file' }];

  vi.stubGlobal('fetch', async (source: string) =>
    source.includes('/api/') || source.includes('api.github.com')
      ? new Response(JSON.stringify(listing))
      : mesh.response,
  );

  const { tree } = github ? await githubTree(repoLink(url)!, url) : await hubTree(hubLink(url)!, url);

  await expect(tree.read('mesh.stl')).resolves.toBeNull();
  expect(mesh.cancel).toHaveBeenCalledOnce();
});

it('refuses GitHub listings above 8 MiB before parsing or downloading files', async () => {
  const listing = oversized(8 * 1024 * 1024 + 1);
  const fetch = vi.fn(async () => listing.response);
  const url = 'https://github.com/me/arm';

  vi.stubGlobal('fetch', fetch);
  await expect(githubTree(repoLink(url)!, url)).rejects.toThrow('Link to a public repo or folder');
  expect(listing.cancel).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
});

it('applies the original caller budget to a Git LFS replacement response', async () => {
  const file = oversized(65);

  vi.stubGlobal('fetch', async (url: string) =>
    url.startsWith('https://raw.githubusercontent.com/')
      ? new Response('version https://git-lfs.github.com/spec/v1\n')
      : file.response,
  );

  await expect(fetchBytes('https://raw.githubusercontent.com/me/arm/main/mesh.stl', 64)).rejects.toBeInstanceOf(
    TooLargeError,
  );
  expect(file.cancel).toHaveBeenCalledOnce();
});
