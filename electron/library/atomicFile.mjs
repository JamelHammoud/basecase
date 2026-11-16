import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export function writeAtomic(file, data) {
  const temp = `${file}.${process.pid}.tmp`;

  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

export async function writeAtomicAsync(file, data) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await fs.promises.writeFile(temp, data, { flag: 'wx' });
    await fs.promises.rename(temp, file);
  } finally {
    await fs.promises.rm(temp, { force: true });
  }
}
