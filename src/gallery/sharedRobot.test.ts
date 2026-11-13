import { afterEach, describe, expect, it, vi } from 'vitest';
import { presetCase } from '../cases/caseBuilder';
import { CODE_SOURCE_MAX_BYTES } from '../cases/console/panelKinds';
import { gameLogic } from '../cases/fixtureGames';
import { parseCase } from '../cases/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { galleryBundleOf } from './buildBundle';
import { fetchGalleryBundle } from './fetchBundle';
import { bundleScene, GALLERY_BUNDLE_MAX_BYTES, galleryBundleBytes, readGalleryBundleBytes } from './galleryBundle';
import { galleryBundles } from './galleryEntries';
import { galleryBundleSource, sharedBundleUrl, sharedRobotLink, sharedRobotPath } from './galleryLinks';

const bundle = () => JSON.parse(JSON.stringify(galleryBundles()[1]));
const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

const STICK = '<canvas></canvas><script>basecase.drive({ v: [1, 0, 0] })</script>';

function cockpit(source = STICK) {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const kase = parseCase({
    ...presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts),
    console: {
      input: ['code', 'keys'],
      panels: [
        { id: 'stick', kind: 'code', title: 'Stick', height: 240, source },
        { id: 'hud', kind: 'code', source: STICK },
      ],
      layout: {
        areas: [
          { canvas: true, overlays: [{ panel: 'hud', anchor: 'top-left', width: 240, height: 48 }] },
          { size: 320, panels: ['stick'] },
        ],
      },
    },
    logic: gameLogic(9),
  });

  return galleryBundleOf({
    slug: 'rover-cockpit-1a2b3c',
    title: 'Rover Cockpit: Two-wheel rover',
    robotName: 'Two-wheel rover',
    parts: rover.parts,
    joints: rover.joints,
    kase,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shared robot links', () => {
  it('read an account and a repo from /r/, and build only a huggingface.co resolve URL', () => {
    expect(sharedRobotPath('/r/tester/rover-1a2b3c')).toEqual({ account: 'tester', repo: 'rover-1a2b3c' });
    expect(galleryBundleSource('/r/tester/rover-1a2b3c')).toBe(
      'https://huggingface.co/datasets/tester/rover-1a2b3c/resolve/main/basecase-robot.json',
    );
    expect(galleryBundleSource('/c/rover-reach-the-flag')).toBe('/gallery/rover-reach-the-flag.json');
    expect(sharedRobotLink('tester/rover-1a2b3c')).toBe('https://app.basecase.so/r/tester/rover-1a2b3c');
  });

  it('refuse crafted names that try to leave the Hub or its repo', () => {
    const crafted = [
      '/r/../etc',
      '/r/tester/..',
      '/r/../../api/whoami-v2',
      '/r/tester/rover/extra',
      '/r/tester/rover%2F..%2F..',
      '/r/%2e%2e/rover',
      '/r/evil.com@huggingface.co/rover',
      '/r/tester/rover?x=1',
      '/r/tester/rover#x',
      '/r/-tester/rover',
      '/r/tester--x/rover',
      '/r//rover',
      '/r/tester/rover:8080',
      `/r/tester/${'a'.repeat(97)}`,
    ];

    for (const path of crafted) {
      expect(sharedRobotPath(path), path).toBeNull();
      expect(galleryBundleSource(path), path).toBeNull();
    }

    for (const [account, repo] of [
      ['..', 'rover'],
      ['tester', '../x'],
      ['//evil.com', 'rover'],
      ['tester', 'rover/../../x'],
      ['evil.com:443', 'x'],
    ]) {
      expect(() => sharedBundleUrl({ account, repo })).toThrow();
    }

    expect(() => sharedRobotLink('tester/rover/x')).toThrow();
    expect(() => sharedRobotLink('../rover')).toThrow();
  });
});

describe('shared robot bundles', () => {
  it('refuse a bundle over the 8 MB cap, before parsing it', () => {
    const big = bundle();

    big.robot.parts[0] = {
      ...big.robot.parts[0],
      kind: 'mesh',
      mesh: { positions: new Array(3 * 400000).fill(123.45), indices: [0, 1, 2], baseSize: [1, 1, 1] },
    };

    expect(() => galleryBundleBytes(big)).toThrow('over 8 MB');
    expect(() => readGalleryBundleBytes(new Uint8Array(GALLERY_BUNDLE_MAX_BYTES + 1))).toThrow('over 8 MB');
    expect(readGalleryBundleBytes(galleryBundleBytes(bundle())).slug).toBe('rover-reach-the-flag');
  });

  it('carry a Case’s code panels and logic into the page and into the scene Open Scene saves', () => {
    const bundle = cockpit();
    const read = readGalleryBundleBytes(galleryBundleBytes(bundle));

    expect(read.case.console).toEqual(bundle.case.console);
    expect(read.case.console?.panels.map((p) => p.kind === 'code' && p.source)).toEqual([STICK, STICK]);
    expect(read.case.logic).toEqual(gameLogic(9));
    expect(bundleScene(read).project.cases).toEqual([bundle.case]);
  });

  it('refuse a code panel that takes the bundle past 8 MB, with the same message', () => {
    const near = cockpit();

    near.title += 'x'.repeat(GALLERY_BUNDLE_MAX_BYTES - galleryBundleBytes(near).byteLength - 200_000);
    expect(galleryBundleBytes(near).byteLength).toBeLessThan(GALLERY_BUNDLE_MAX_BYTES);

    const over = { ...cockpit(`<p>${'x'.repeat(CODE_SOURCE_MAX_BYTES - 7)}</p>`), title: near.title };

    expect(() => galleryBundleBytes(over)).toThrow('It’s over 8 MB.');
    expect(() => readGalleryBundleBytes(bytesOf(over))).toThrow('It’s over 8 MB.');
  });

  it('refuse a mesh whose triangles point past its vertices, and a skill that isn’t what its record says', () => {
    const hostile = bundle();

    hostile.robot.parts[0] = {
      ...hostile.robot.parts[0],
      kind: 'mesh',
      mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 99], baseSize: [1, 1, 1] },
    };

    expect(() => readGalleryBundleBytes(bytesOf(hostile))).toThrow();
    expect(() => readGalleryBundleBytes(bytesOf({ ...bundle(), trained: { kind: 'script', code: 'x' } }))).toThrow();
    expect(() =>
      readGalleryBundleBytes(bytesOf({ ...bundle(), trained: { kind: 'skill', record: { name: 'x' }, skill: {} } })),
    ).toThrow();
  });

  it('stop reading a download as soon as it passes the cap, whatever its headers say', async () => {
    const over = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        sent += over.byteLength;
        controller.enqueue(over);
      },
    });
    const fetched = vi.fn<typeof fetch>();

    vi.stubGlobal('fetch', fetched);
    fetched.mockResolvedValueOnce(new Response(stream));
    await expect(fetchGalleryBundle('https://huggingface.co/x')).rejects.toThrow();
    expect(sent).toBeLessThan(GALLERY_BUNDLE_MAX_BYTES + 3 * over.byteLength);

    fetched.mockResolvedValueOnce(
      new Response('{}', { headers: { 'Content-Length': String(GALLERY_BUNDLE_MAX_BYTES + 1) } }),
    );
    await expect(fetchGalleryBundle('https://huggingface.co/x')).rejects.toThrow('Too large');

    fetched.mockResolvedValueOnce(new Response(galleryBundleBytes(bundle()) as BodyInit));
    expect((await fetchGalleryBundle('https://huggingface.co/x')).slug).toBe('rover-reach-the-flag');
    expect(fetched.mock.calls.at(-1)?.[1]).toEqual({ credentials: 'omit' });
  });
});
