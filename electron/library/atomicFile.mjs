import fs from 'node:fs';

export function writeAtomic(file, data) {
  const temp = `${file}.${process.pid}.tmp`;

  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}
