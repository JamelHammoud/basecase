import { parseMjcf } from './mjcf';
import type { Model } from './model';
import { filesResolver, inlineIncludes, rawUrl, urlResolver, type Resolver, type Source } from './sources';
import { parseUrdf } from './urdf';

export async function readModel(source: Source): Promise<{ model: Model; resolver: Resolver }> {
  const resolver = source.kind === 'url' ? await urlResolver(source.url) : filesResolver(source.files);

  if ('pickEntry' in resolver) await (resolver as ReturnType<typeof filesResolver>).pickEntry();

  let text = resolver.entry.text;

  if (/<mujoco\b/.test(text))
    text = await inlineIncludes(
      text,
      resolver.read,
      source.kind === 'url' ? new URL(rawUrl(source.url)).pathname : resolver.entry.name,
    );

  const doc = new DOMParser().parseFromString(text.replace(/<!--[\s\S]*?-->/g, ''), 'application/xml');

  if (doc.querySelector('parsererror')) throw new Error('Choose a URDF or MJCF file. That one isn’t valid XML.');

  const rootTag = doc.documentElement.tagName;

  if (rootTag !== 'robot' && rootTag !== 'mujoco') throw new Error('Choose a URDF or MJCF file.');

  return { model: rootTag === 'robot' ? parseUrdf(doc) : parseMjcf(doc), resolver };
}
