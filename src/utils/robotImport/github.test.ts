import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importRobot } from '../robotImport';
import { ZIP_TOO_LARGE } from './archive';
import { RobotChoiceError } from './entry';
import { fetchBytes, TooLargeError } from './sources';
import { deskArmFiles, deskArmZip, TinyDomParser } from './robotImport.fixtures';

const raw = 'https://raw.githubusercontent.com/me/arm/HEAD/';
const files = deskArmFiles('arm_description');
const tree = ['README.md', ...Object.keys(files)];
const listing = (paths: string[]) => JSON.stringify({ tree: paths.map((path) => ({ path, type: 'blob' })) });
const served = new Map<string, BodyInit | Response>([
  ['https://api.github.com/repos/me/arm/git/trees/HEAD?recursive=1', listing(tree)],
  ...Object.entries(files).map(([path, bytes]) => [raw + path, bytes as Uint8Array<ArrayBuffer>] as const),
]);
const fetched: string[] = [];

beforeEach(() => {
  vi.stubGlobal('DOMParser', TinyDomParser);
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);

    const body = served.get(url);

    if (body instanceof Response) return body;

    return body === undefined ? new Response('', { status: 404 }) : new Response(body);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub repository links', () => {
  it('finds the description in a repo and records the file it came from', async () => {
    const robot = await importRobot({ kind: 'url', url: 'https://github.com/me/arm' });

    expect(robot.joints.map((j) => j.name)).toEqual(['Shoulder', 'Elbow']);
    expect(robot.notes).toEqual([]);
    expect(robot.parts[0].robotLink?.url).toBe(`${raw}arm_description/urdf/desk_arm.urdf`);
    expect(fetched.every((url) => url.startsWith('https://'))).toBe(true);
    expect(fetched.filter((url) => !served.has(url))).toEqual([]);
  });

  it('asks which robot when a repo holds several, and imports the one picked', async () => {
    const two = { ...deskArmFiles('a'), ...deskArmFiles('b') };
    const at = 'https://raw.githubusercontent.com/me/arms/main/';

    served.set('https://api.github.com/repos/me/arms/git/trees/main?recursive=1', listing(Object.keys(two)));

    for (const [path, bytes] of Object.entries(two)) served.set(at + path, bytes as Uint8Array<ArrayBuffer>);

    const url = 'https://github.com/me/arms/tree/main';
    const pending = importRobot({ kind: 'url', url });

    await expect(pending).rejects.toBeInstanceOf(RobotChoiceError);
    await expect(pending).rejects.toMatchObject({ choices: ['a/urdf/desk_arm.urdf', 'b/urdf/desk_arm.urdf'] });

    const picked = await importRobot({ kind: 'url', url, entry: 'b/urdf/desk_arm.urdf' });

    expect(picked.joints).toHaveLength(2);
    expect(picked.parts[0].robotLink?.url).toBe(`${at}b/urdf/desk_arm.urdf`);
  });
});

describe('zip links', () => {
  it('downloads a GitHub file link to a zip from raw.githubusercontent.com', async () => {
    served.set('https://raw.githubusercontent.com/me/arm/main/desk_arm.zip', deskArmZip() as Uint8Array<ArrayBuffer>);

    const robot = await importRobot({ kind: 'url', url: 'https://github.com/me/arm/blob/main/desk_arm.zip' });

    expect(robot.joints.map((j) => j.name)).toEqual(['Shoulder', 'Elbow']);
  });

  it('opens a GitHub Download ZIP link as the repo at that ref', async () => {
    const at = 'https://raw.githubusercontent.com/me/arm/main/';

    served.set('https://api.github.com/repos/me/arm/git/trees/main?recursive=1', listing(tree));

    for (const [path, bytes] of Object.entries(files)) served.set(at + path, bytes as Uint8Array<ArrayBuffer>);

    const robot = await importRobot({ kind: 'url', url: 'https://github.com/me/arm/archive/refs/heads/main.zip' });

    expect(robot.parts[0].robotLink?.url).toBe(`${at}arm_description/urdf/desk_arm.urdf`);
  });

  it('stops a zip link past the size cap before reading it', async () => {
    const huge = new Response('PK', { headers: { 'content-length': String(300 * 1024 * 1024) } });

    served.set('https://example.com/huge.zip', huge);

    await expect(importRobot({ kind: 'url', url: 'https://example.com/huge.zip' })).rejects.toThrow(ZIP_TOO_LARGE);
  });

  it('stops a capped download once the stream passes the cap', async () => {
    const chunk = new Uint8Array(8);
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(chunk),
    });

    served.set('https://example.com/endless', new Response(stream));

    await expect(fetchBytes('https://example.com/endless', 64)).rejects.toBeInstanceOf(TooLargeError);
  });
});
