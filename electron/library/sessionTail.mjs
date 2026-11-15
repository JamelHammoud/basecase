import fs from 'node:fs';

const MAX_BYTES = 1024 * 1024;

export function sessionTail(file) {
  let fd;

  try {
    fd = fs.openSync(file, 'r');

    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - MAX_BYTES);
    const bytes = Buffer.alloc(Math.min(size, MAX_BYTES));
    const read = fs.readSync(fd, bytes, 0, bytes.length, start);
    const text = bytes.subarray(0, read).toString('utf8');
    const first = start ? text.indexOf('\n') + 1 : 0;
    const last = text.lastIndexOf('\n') + 1;

    return first && first >= last ? '' : text.slice(first, last);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
