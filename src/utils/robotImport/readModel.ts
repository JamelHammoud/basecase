import { chooseEntry, inScope, looksLikeRobotMjcf, RobotChoiceError } from './entry';
import { githubTree, repoLink } from './github';
import { parseMjcf } from './mjcf';
import type { Model } from './model';
import { JOINT_MAP_FILE, packageEntries, parseJointMap, type JointMap } from './robotPackage';
import { convertedResolver, parseConverted } from './simready';
import { fetchBytes, inlineIncludes, rawUrl, urlResolver, type Resolver, type Source } from './sources';
import { localTree, treeResolver, type Tree } from './tree';
import { parseUrdf } from './urdf';

export interface ReadModel {
  model: Model;
  resolver: Resolver;
  jointMap?: JointMap;
  origin?: string;
}

interface TreeEntry {
  entry: string;
  jointMap?: JointMap;
}

interface Located {
  tree: Tree;
  scope: string;
}

const NO_ROBOT = 'Choose a folder with a .urdf or MJCF .xml file.';
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

export const isZipLink = (url: string) => /\.zip(?:[?#]|$)/i.test(url.trim());

export const isRobotLink = (url: string) =>
  !!repoLink(url) || /^https:\/\/[^\s/]+\.[^\s/]+\/\S+\.(urdf|xml|mjcf|zip)(?:[?#]\S*)?$/i.test(url.trim());

async function zipTree(url: string): Promise<Tree> {
  const bytes = await fetchBytes(url).catch(() => {
    throw new Error('Couldn’t download that zip.');
  });

  if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error('That zip is too large to import.');

  return localTree([{ path: 'download.zip', blob: new Blob([bytes]) }]);
}

async function locate(source: Exclude<Source, { kind: 'converted' }>): Promise<Located | null> {
  if (source.kind === 'files') return { tree: await localTree(source.files), scope: '' };

  const repo = repoLink(source.url);

  if (repo) return githubTree(repo);

  return isZipLink(source.url) ? { tree: await zipTree(source.url), scope: '' } : null;
}

const decode = (data: ArrayBuffer | null) => (data ? new TextDecoder().decode(data) : '');

async function packageEntry({ tree, scope }: Located, mapPath: string): Promise<TreeEntry> {
  const paths = inScope(tree.paths, scope);
  const jointMap = parseJointMap(decode(await tree.read(mapPath)));
  const entry = jointMap && packageEntries(jointMap, mapPath).find((p) => paths.includes(p));

  if (entry) return { entry, jointMap };

  return treeEntry({ tree: { ...tree, paths: paths.filter((p) => !p.endsWith(JOINT_MAP_FILE)) }, scope: '' });
}

async function treeEntry(located: Located, picked?: string): Promise<TreeEntry> {
  const { tree, scope } = located;
  const paths = inScope(tree.paths, scope);

  if (picked && paths.includes(picked)) return { entry: picked };

  const choice = await chooseEntry(paths, async (p) => looksLikeRobotMjcf(decode(await tree.read(p))));

  if (!choice) throw new Error(NO_ROBOT);

  if ('jointMap' in choice) return packageEntry(located, choice.jointMap);

  if ('choices' in choice) throw new RobotChoiceError(choice.choices);

  return choice;
}

async function sourceResolver(source: Exclude<Source, { kind: 'converted' }>) {
  const located = await locate(source);

  if (!located && source.kind === 'url') {
    const resolver = await urlResolver(source.url);

    return { resolver, from: new URL(rawUrl(source.url)).pathname, origin: source.url };
  }

  if (!located) throw new Error(NO_ROBOT);

  const { entry, jointMap } = await treeEntry(located, source.entry);
  const resolver = await treeResolver(located.tree, entry);
  const origin = located.tree.urlOf?.(entry);

  return { resolver, from: entry, origin, jointMap };
}

export async function readModel(source: Source): Promise<ReadModel> {
  if (source.kind === 'converted')
    return { model: parseConverted(source.model), resolver: convertedResolver(source.files) };

  const { resolver, from, origin, jointMap } = await sourceResolver(source);
  let text = resolver.entry.text;

  if (/<mujoco\b/.test(text)) text = await inlineIncludes(text, resolver.read, from);

  const doc = new DOMParser().parseFromString(text.replace(/<!--[\s\S]*?-->/g, ''), 'application/xml');

  if (doc.querySelector('parsererror')) throw new Error('Choose a URDF or MJCF file. That one isn’t valid XML.');

  const rootTag = doc.documentElement.tagName;

  if (rootTag !== 'robot' && rootTag !== 'mujoco') throw new Error('Choose a URDF or MJCF file.');

  return { model: rootTag === 'robot' ? parseUrdf(doc) : parseMjcf(doc), resolver, jointMap, origin };
}
