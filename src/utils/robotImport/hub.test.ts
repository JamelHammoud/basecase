import { strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importRobot, isRobotLink } from '../robotImport';
import { hubFileUrl, hubLink } from './hub';
import { deskArmFiles, deskArmUrdf, deskArmZip, hubListing, TinyDomParser } from './robotImport.fixtures';

type Served = () => Response;

const served = new Map<string, Served>();
const fetched: string[] = [];
const api = (repo: string, rev = 'main') => `https://huggingface.co/api/${repo}/tree/${rev}?recursive=true`;

function serveRepo(opts: { repo: string; files: Record<string, Uint8Array>; at?: string }) {
  const at = opts.at ?? `https://huggingface.co/${opts.repo}/resolve/main/`;
  const apiRepo = opts.repo.startsWith('datasets/') ? opts.repo : `models/${opts.repo}`;
  const listing = hubListing(opts.files);

  served.set(api(apiRepo), () => new Response(listing, { headers: { 'content-type': 'application/json' } }));

  for (const [path, bytes] of Object.entries(opts.files)) {
    served.set(at + path, () => new Response(bytes as Uint8Array<ArrayBuffer>));
  }
}

beforeEach(() => {
  served.clear();
  fetched.length = 0;
  vi.stubGlobal('DOMParser', TinyDomParser);
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);

    return served.get(url)?.() ?? new Response('Repository not found', { status: 401 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hugging Face Hub links', () => {
  it('imports a URDF description repo with meshes in subfolders, fetching only what it references', async () => {
    const files = { 'README.md': strToU8('# Desk arm'), ...deskArmFiles('desk_arm_description') };

    serveRepo({ repo: 'me/desk-arm', files });

    const robot = await importRobot({ kind: 'url', url: 'https://huggingface.co/me/desk-arm' });
    const at = 'https://huggingface.co/me/desk-arm/resolve/main/desk_arm_description/urdf/';

    expect(robot.joints.map((j) => [j.name, j.range])).toEqual([
      ['Shoulder', [-85.94, 85.94]],
      ['Elbow', [-28.65, 114.59]],
    ]);
    expect(robot.notes).toEqual([]);
    expect(robot.parts[0].robotLink?.url).toBe(`${at}desk_arm.urdf`);
    expect(fetched.sort()).toEqual(
      [
        api('models/me/desk-arm'),
        `${at}desk_arm.urdf`,
        ...['base_plate', 'forearm', 'upper_arm'].map((m) => `${at}meshes/${m}.stl`),
      ].sort(),
    );
  });

  it('opens a dataset repo folder, a file link and a zip on the Hub', async () => {
    const two = { ...deskArmFiles('a'), ...deskArmFiles('b'), 'desk_arm.zip': deskArmZip() };

    serveRepo({ repo: 'datasets/me/arms', files: two });

    const folder = await importRobot({ kind: 'url', url: 'https://huggingface.co/datasets/me/arms/tree/main/b' });

    expect(folder.parts[0].robotLink?.url).toBe(
      'https://huggingface.co/datasets/me/arms/resolve/main/b/urdf/desk_arm.urdf',
    );

    const file = await importRobot({
      kind: 'url',
      url: 'https://huggingface.co/datasets/me/arms/blob/main/a/urdf/desk_arm.urdf',
    });

    expect(file.joints).toHaveLength(2);
    expect(file.parts[0].robotLink?.url).toBe(
      'https://huggingface.co/datasets/me/arms/resolve/main/a/urdf/desk_arm.urdf',
    );

    const zip = await importRobot({
      kind: 'url',
      url: 'https://huggingface.co/datasets/me/arms/resolve/main/desk_arm.zip',
    });

    expect(zip.joints.map((j) => j.name)).toEqual(['Shoulder', 'Elbow']);
  });

  it('follows the listing’s next page on the same repo', async () => {
    const files = deskArmFiles('arm');
    const [first, ...rest] = Object.keys(files);
    const page = (paths: string[]) => hubListing(Object.fromEntries(paths.map((p) => [p, files[p]])));
    const next = `${api('models/me/paged')}&cursor=abc`;

    serveRepo({ repo: 'me/paged', files });
    served.set(
      api('models/me/paged'),
      () => new Response(page([first]), { headers: { link: `<${next}>; rel="next"` } }),
    );
    served.set(next, () => new Response(page(rest)));

    const robot = await importRobot({ kind: 'url', url: 'https://huggingface.co/me/paged' });

    expect(robot.joints).toHaveLength(2);
  });

  it('names the link when a repo holds no robot', async () => {
    serveRepo({ repo: 'me/notes', files: { 'README.md': strToU8('# Notes'), 'config.json': strToU8('{}') } });

    await expect(importRobot({ kind: 'url', url: 'https://huggingface.co/me/notes' })).rejects.toThrow(
      'Couldn’t find a .urdf or MJCF .xml file in https://huggingface.co/me/notes.',
    );
    await expect(importRobot({ kind: 'url', url: 'https://huggingface.co/me/private' })).rejects.toThrow(
      'Couldn’t open https://huggingface.co/me/private. Link to a public repo or folder.',
    );
  });

  it('takes repo, folder and file links, and nothing else on huggingface.co', () => {
    for (const url of [
      'https://huggingface.co/me/arm',
      'https://huggingface.co/datasets/me/arm/tree/v1.0/urdf',
      'https://huggingface.co/me/arm/resolve/main/robot.xml?download=true',
    ]) {
      expect(isRobotLink(url)).toBe(true);
    }

    for (const url of ['https://huggingface.co/docs/lerobot', 'https://huggingface.co/spaces/me/arm']) {
      expect(isRobotLink(url)).toBe(false);
    }
  });
});

describe('Hub link security', () => {
  it('rejects links that leave huggingface.co or climb out of the repo', () => {
    for (const url of [
      'https://huggingface.co.evil.com/me/arm',
      'https://huggingface.co@evil.com/me/arm',
      'https://evil.com/huggingface.co/me/arm',
      'http://huggingface.co/me/arm',
      'https://huggingface.co/../arm',
      'https://huggingface.co/me/..',
      'https://huggingface.co/me/arm/tree/main/..%2F..%2Fevil',
      'https://huggingface.co/me/arm/tree/main/urdf/../../../evil',
      'https://huggingface.co/me/arm/tree/%2E%2E/urdf',
      'https://huggingface.co/me/arm/tree/main/%E0%A4%A',
    ]) {
      expect(hubLink(url), url).toBeNull();
    }
  });

  it('keeps a crafted revision and path inside the repo’s resolve URLs', () => {
    const link = hubLink('https://huggingface.co/me/arm/tree/refs%2Fpr%2F1')!;

    expect(link.rev).toBe('refs/pr/1');
    expect(hubFileUrl(link, 'a b/@evil.com:443/x.stl')).toBe(
      'https://huggingface.co/me/arm/resolve/refs%2Fpr%2F1/a%20b/%40evil.com%3A443/x.stl',
    );
  });

  it('never fetches outside the listed repo files, whatever the listing or description says', async () => {
    const hostile = deskArmUrdf()
      .replace('meshes/base_plate.stl', 'https://evil.com/base_plate.stl')
      .replace('meshes/upper_arm.stl', '../../../../../outside/upper_arm.stl')
      .replace('meshes/forearm.stl', 'package://evil.com/forearm.stl');
    const files = { ...deskArmFiles('arm'), 'arm/urdf/desk_arm.urdf': strToU8(hostile) };
    const escaping = JSON.stringify([
      ...JSON.parse(hubListing(files)),
      { type: 'file', path: '../../outside/upper_arm.stl', size: 1 },
      { type: 'file', path: '/etc/passwd', size: 1 },
    ]);

    serveRepo({ repo: 'me/hostile', files });
    served.set(
      api('models/me/hostile'),
      () =>
        new Response(escaping, { headers: { link: '<https://evil.com/api/models/me/hostile/tree/main>; rel="next"' } }),
    );

    const robot = await importRobot({ kind: 'url', url: 'https://huggingface.co/me/hostile' });

    expect(robot.joints).toHaveLength(2);
    expect(fetched.length).toBeGreaterThan(1);
    expect(
      fetched.every(
        (url) =>
          url.startsWith('https://huggingface.co/api/models/me/hostile/') ||
          url.startsWith('https://huggingface.co/me/hostile/resolve/main/arm/'),
      ),
    ).toBe(true);
  });
});
