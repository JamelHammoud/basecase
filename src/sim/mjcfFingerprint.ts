import { hashText } from '../utils/geometryHash';

const SCENE_INDEXED: Array<[RegExp, string]> = [
  [/(?<![A-Za-z0-9])j\d+_/g, 'j_'],
  [/(?<![A-Za-z0-9])m\d+_/g, 'm_'],
  [/root_\d+/g, 'root'],
];

const VERTEX = /vertex="([^"]*)"/;

function sortedVertices(asset: string): string {
  const values = VERTEX.exec(asset)?.[1].split(' ') ?? [];
  const points: string[] = [];

  for (let i = 0; i + 2 < values.length; i += 3) points.push(`${values[i]} ${values[i + 1]} ${values[i + 2]}`);

  return asset.replace(VERTEX, `vertex="${points.sort().join(' ')}"`);
}

export interface RobotXml {
  timestep: number;
  assets: string[];
  body: string[];
  actuators: string[];
}

export function robotFingerprint({ timestep, assets, body, actuators }: RobotXml): string {
  const stableBody = body
    .slice(1)
    .map((line) => line.replace(/contype="-?\d+" conaffinity="-?\d+"/g, 'contype="1" conaffinity="0"'));
  const text = [`timestep ${timestep}`, ...assets.map(sortedVertices), ...stableBody, ...actuators].join('\n');

  return hashText(SCENE_INDEXED.reduce((s, [pattern, plain]) => s.replace(pattern, plain), text));
}
