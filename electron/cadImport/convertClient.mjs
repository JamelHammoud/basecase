import fs from 'node:fs';
import path from 'node:path';
import { checkedConversion } from './convertPolicy.mjs';
import { decodeReply } from './reply.mjs';

export const NO_CONVERTER_ERROR = 'Importing maker CAD runs in the desktop app. Open this scene there to import it.';

export async function convertFile(converter, { file, out, ...job }) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const reply = await converter.convert({ ...job, name: path.basename(file), bytes });
  const { glb, result } = checkedConversion(decodeReply(reply));

  fs.writeFileSync(out, glb);

  return result;
}
