import type { OnshapeSource } from '../types/robotLink';

const ID = '[0-9a-f]{24}';
const ASSEMBLY_LINK = new RegExp(
  `^https://cad\\.onshape\\.com/documents/(${ID})/([wv])/(${ID})/e/(${ID})(?:[?#]\\S*)?$`,
);
const IS_ID = new RegExp(`^${ID}$`);

export const isOnshapeLink = (url: string) => ASSEMBLY_LINK.test(url.trim());

export function onshapeSourceOf(url: string): OnshapeSource | null {
  const match = ASSEMBLY_LINK.exec(url.trim());

  if (!match) return null;

  const [, did, wvm, wvmid, eid] = match;

  return { did, wvm: wvm as OnshapeSource['wvm'], wvmid, eid };
}

const isId = (value: unknown) => typeof value === 'string' && IS_ID.test(value);

export function onshapeLinkOf(source: OnshapeSource | undefined): string | null {
  if (!source || !isId(source.did) || !isId(source.wvmid) || !isId(source.eid)) return null;

  if (source.wvm !== 'w' && source.wvm !== 'v') return null;

  return `https://cad.onshape.com/documents/${source.did}/${source.wvm}/${source.wvmid}/e/${source.eid}`;
}
