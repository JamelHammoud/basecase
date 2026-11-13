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

export type DescriptionKind = 'mjcf' | 'mjcf-includes' | 'urdf';

const URDF_ROOT = /^\s*(?:(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->)\s*)*<robot\b/;
const isXml = (path: string) => /\.(xml|mjcf)$/i.test(path);
const isUrdf = (path: string) => /\.urdf$/i.test(path);

export function descriptionKind(text: string): DescriptionKind | null {
  if (URDF_ROOT.test(text)) return 'urdf';

  if (!/<mujoco\b/.test(text)) return null;

  if (/<worldbody\b/.test(text)) return 'mjcf';

  return /<include\b/.test(text) ? 'mjcf-includes' : null;
}

type Classify = (path: string) => Promise<DescriptionKind | null>;

async function peekXml(paths: string[], classify: Classify): Promise<Array<[string, DescriptionKind | null]>> {
  const xml = descriptions(paths).filter(isXml).sort(byDepth).slice(0, MAX_PEEKS);
  const kinds = await Promise.all(xml.map((p) => classify(p).catch(() => null)));

  return xml.map((p, i) => [p, kinds[i]]);
}

function decide(paths: string[]): EntryChoice | null {
  if (!paths.length) return null;

  const top = shallowest(paths);

  return top.length === 1 ? { entry: top[0] } : { choices: top };
}

export async function chooseEntry(paths: string[], classify: Classify): Promise<EntryChoice | null> {
  const peeked = await peekXml(paths, classify);
  const ofKind = (kind: DescriptionKind) => peeked.filter(([, k]) => k === kind).map(([p]) => p);
  const mjcf = ofKind('mjcf');

  return (
    decide(mjcf.filter((p) => !SCENE.test(p))) ??
    decide([...descriptions(paths).filter(isUrdf), ...ofKind('urdf')]) ??
    decide(mjcf) ??
    decide(paths.filter(isUrdf)) ??
    decide(ofKind('mjcf-includes'))
  );
}
