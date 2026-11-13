import { checkedBodies } from './bodiesPolicy.mjs';
import { NO_CONVERTER_ERROR } from './convertClient.mjs';
import { decodeReply } from './reply.mjs';

export const CAD_FILE_EXTENSIONS = ['.step', '.stp', '.iges', '.igs'];

const extensionOf = (name) => /\.[^./\\]+$/.exec(name)?.[0].toLowerCase() ?? '';

export async function openCadFile(converter, { name, bytes } = {}) {
  if (typeof name !== 'string' || !CAD_FILE_EXTENSIONS.includes(extensionOf(name)))
    throw new Error('Only STEP and IGES files open here.');

  if (!converter) throw new Error(NO_CONVERTER_ERROR);

  const reply = await converter.convert({ id: 'import', url: '', name, ext: extensionOf(name), bytes, bodies: true });

  return checkedBodies(decodeReply(reply));
}
