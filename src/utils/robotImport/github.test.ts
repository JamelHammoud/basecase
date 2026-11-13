import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importRobot } from '../robotImport';
import { RobotChoiceError } from './entry';
import { deskArmFiles, TinyDomParser } from './robotImport.fixtures';

const raw = 'https://raw.githubusercontent.com/me/arm/HEAD/';
const files = deskArmFiles('arm_description');
const tree = ['README.md', ...Object.keys(files)];
const listing = (paths: string[]) => JSON.stringify({ tree: paths.map((path) => ({ path, type: 'blob' })) });
const served = new Map<string, string | Uint8Array<ArrayBuffer>>([
  ['https://api.github.com/repos/me/arm/git/trees/HEAD?recursive=1', listing(tree)],
  ...Object.entries(files).map(([path, bytes]) => [raw + path, bytes as Uint8Array<ArrayBuffer>] as const),
]);
const fetched: string[] = [];

beforeEach(() => {
  vi.stubGlobal('DOMParser', TinyDomParser);
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);

    const body = served.get(url);

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
