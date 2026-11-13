import { ZIP_TOO_LARGE } from './archive';
import { chooseEntry, descriptionKind, inScope, RobotChoiceError } from './entry';
import { githubTree, repoLink } from './github';
import { hubFileUrl, hubLink, hubTree } from './hub';
import { parseMjcf } from './mjcf';
import type { Model } from './model';
import { convertedResolver, parseConverted } from './simready';
import {
  fetchBytes,
  inlineIncludes,
  noRobotAt,
  rawUrl,
  TooLargeError,
  urlResolver,
  type Resolver,
  type Source,
} from './sources';
import { localTree, treeResolver, type Tree } from './tree';
import { parseUrdf } from './urdf';

export interface ReadModel {
  model: Model;
  resolver: Resolver;
  origin?: string;
}

interface Located {
  tree: Tree;
  scope: string;
  entry?: string;
}

const NO_ROBOT = 'Choose a folder with a .urdf or MJCF .xml file.';
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

export const isZipLink = (url: string) => /\.zip(?:[?#]|$)/i.test(url.trim());

export const isRobotLink = (url: string) =>
  !!repoLink(url) ||
  !!hubLink(url) ||
  /^https:\/\/[^\s/]+\.[^\s/]+\/\S+\.(urdf|xml|mjcf|zip)(?:[?#]\S*)?$/i.test(url.trim());

async function zipTree(url: string): Promise<Tree> {
  const bytes = await fetchBytes(url, MAX_ZIP_BYTES).catch((error: unknown) => {
    throw new Error(
      error instanceof TooLargeError ? ZIP_TOO_LARGE : 'Couldn’t download that zip. Link to a public zip file.',
    );
  });

  return localTree([{ path: 'download.zip', blob: new Blob([bytes]) }]);
}

async function locate(source: Exclude<Source, { kind: 'converted' }>): Promise<Located | null> {
  if (source.kind === 'files') return { tree: await localTree(source.files), scope: '' };

  const repo = repoLink(source.url);

  if (repo) return githubTree(repo, source.url);

  const hub = hubLink(source.url);

  if (hub?.file && isZipLink(hub.path)) return { tree: await zipTree(hubFileUrl(hub, hub.path)), scope: '' };

  if (hub) return hubTree(hub, source.url);

  return isZipLink(source.url) ? { tree: await zipTree(rawUrl(source.url)), scope: '' } : null;
}

const decode = (data: ArrayBuffer | null) => (data ? new TextDecoder().decode(data) : '');

async function treeEntry({ tree, scope }: Located, picked?: string, link?: string): Promise<string> {
  const paths = inScope(tree.paths, scope);

  if (picked && paths.includes(picked)) return picked;

  const choice = await chooseEntry(paths, async (p) => descriptionKind(decode(await tree.read(p))));

  if (!choice) throw link ? noRobotAt(link) : new Error(NO_ROBOT);

  if ('choices' in choice) throw new RobotChoiceError(choice.choices);

  return choice.entry;
}

async function sourceResolver(source: Exclude<Source, { kind: 'converted' }>) {
  const located = await locate(source);

  if (!located && source.kind === 'url') {
    const resolver = await urlResolver(source.url);

    return { resolver, from: new URL(rawUrl(source.url)).pathname, origin: source.url };
  }

  if (!located) throw new Error(NO_ROBOT);

  const entry = await treeEntry(located, source.entry ?? located.entry, source.kind === 'url' ? source.url : undefined);
  const resolver = await treeResolver(located.tree, entry);
  const origin = located.tree.urlOf?.(entry);

  return { resolver, from: entry, origin };
}

export async function readModel(source: Source): Promise<ReadModel> {
  if (source.kind === 'converted')
    return { model: parseConverted(source.model), resolver: convertedResolver(source.files) };

  const { resolver, from, origin } = await sourceResolver(source);
  let text = resolver.entry.text;

  if (/<mujoco\b/.test(text)) text = await inlineIncludes(text, resolver.read, from);

  const doc = new DOMParser().parseFromString(text.replace(/<!--[\s\S]*?-->/g, ''), 'application/xml');

  if (doc.querySelector('parsererror')) throw new Error('Choose a URDF or MJCF file. That one isn’t valid XML.');

  const rootTag = doc.documentElement.tagName;

  if (rootTag !== 'robot' && rootTag !== 'mujoco') throw new Error('Choose a URDF or MJCF file.');

  return { model: rootTag === 'robot' ? parseUrdf(doc) : parseMjcf(doc), resolver, origin };
}
