import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it } from 'vitest';
import { diagnosticJobLog } from './diagnosticLog.mjs';
import { FILE_LIMIT } from './diagnosticContract.mjs';

function processLog(chunks, code = 0) {
  const child = new EventEmitter();

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    chunks.forEach((chunk) => child.stdout.write(chunk));
    child.stdout.end();
    child.stderr.end();
    child.emit('close', code);
  });

  return child;
}

it('streams a job log beyond the buffer limit and retains its final cleanup bytes', async () => {
  const ending = Buffer.from('cleanup failed');
  const chunks = [Buffer.alloc(FILE_LIMIT, 65), Buffer.alloc(FILE_LIMIT, 66), ending];
  const log = await diagnosticJobLog({ repository: 'o/r', id: 42 }, () => processLog(chunks));

  expect(log).toEqual(Buffer.concat(chunks).subarray(-FILE_LIMIT));
  expect(log.subarray(-ending.length)).toEqual(ending);
});

it('rejects an unsuccessful download even when it emitted a partial log', async () => {
  await expect(
    diagnosticJobLog({ repository: 'o/r', id: 42 }, () => processLog([Buffer.from('partial')], 1)),
  ).rejects.toThrow('Job log could not be retrieved');
});
