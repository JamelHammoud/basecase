const NOT_ROBOTS = /(^|\/)(package\.xml|[^/]*\.(launch|gazebo|srdf|sdf|world|config)\.xml|[^/]*\.launch)$/i;
const NOT_ROBOT_DIRS = /(^|\/)(launch|config|rviz|worlds?|test|tests|\.github|docs?)\//i;
const SCENE = /(^|\/)scene[^/]*\.xml$/i;
const MAX_PEEKS = 24;

export type EntryChoice = { entry: string } | { choices: string[] };

export class RobotChoiceError extends Error {
  readonly choices: string[];

  constructor(choices: string[]) {
    super('Choose a robot');
    this.choices = choices;
  }
}

export const depthOf = (path: string) => path.split('/').length;

const byDepth = (a: string, b: string) => depthOf(a) - depthOf(b) || a.localeCompare(b);

export function inScope(paths: string[], scope: string): string[] {
  const dir = scope.replace(/^\/+|\/+$/g, '');

  return dir ? paths.filter((p) => p === dir || p.startsWith(`${dir}/`)) : paths;
}

function shallowest(paths: string[]): string[] {
  const sorted = [...paths].sort(byDepth);
  const top = sorted.length ? depthOf(sorted[0]) : 0;

  return sorted.filter((p) => depthOf(p) === top);
}

const descriptions = (paths: string[]) => paths.filter((p) => !NOT_ROBOTS.test(p) && !NOT_ROBOT_DIRS.test(p));

export const isMjcfCandidate = (path: string) => /\.(xml|mjcf)$/i.test(path);

async function mjcfRobots(paths: string[], isRobotMjcf: (path: string) => Promise<boolean>): Promise<string[]> {
  const xml = descriptions(paths).filter(isMjcfCandidate).sort(byDepth).slice(0, MAX_PEEKS);
  const checked = await Promise.all(xml.map(async (p) => ((await isRobotMjcf(p).catch(() => false)) ? p : null)));

  return checked.filter((p): p is string => !!p);
}

function decide(paths: string[]): EntryChoice | null {
  if (!paths.length) return null;

  const top = shallowest(paths);

  return top.length === 1 ? { entry: top[0] } : { choices: top };
}

export async function chooseEntry(
  paths: string[],
  isRobotMjcf: (path: string) => Promise<boolean>,
): Promise<EntryChoice | null> {
  const mjcf = await mjcfRobots(paths, isRobotMjcf);
  const robots = mjcf.filter((p) => !SCENE.test(p));

  return (
    decide(robots) ??
    decide(descriptions(paths).filter((p) => /\.urdf$/i.test(p))) ??
    decide(mjcf) ??
    decide(paths.filter((p) => /\.urdf$/i.test(p)))
  );
}

export const looksLikeRobotMjcf = (head: string) => /<mujoco\b/.test(head) && /<worldbody\b/.test(head);
