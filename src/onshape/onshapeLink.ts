const ID = '[0-9a-f]{24}';
const ASSEMBLY_LINK = new RegExp(`^https://cad\\.onshape\\.com/documents/${ID}/[wv]/${ID}/e/${ID}(?:[?#]\\S*)?$`);

export const isOnshapeLink = (url: string) => ASSEMBLY_LINK.test(url.trim());
