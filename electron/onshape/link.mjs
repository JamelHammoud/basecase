export const ONSHAPE_ORIGIN = 'https://cad.onshape.com';

const ID = '[0-9a-f]{24}';
const DOCUMENT_LINK = new RegExp(
  `^https://cad\\.onshape\\.com/documents/(${ID})/([wv])/(${ID})/e/(${ID})(?:[?#][^\\s]*)?$`,
);

export const NOT_AN_ASSEMBLY_LINK = 'Paste the link of an Onshape assembly tab.';

export function documentOfLink(link) {
  const match = DOCUMENT_LINK.exec(typeof link === 'string' ? link.trim() : '');

  if (!match) throw new Error(NOT_AN_ASSEMBLY_LINK);

  const [, did, wvm, wvmid, eid] = match;

  return { did, wvm, wvmid, eid };
}

export const isId = (value) => typeof value === 'string' && new RegExp(`^${ID}$`).test(value);
