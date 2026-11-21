import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function workflowMemory(browser) {
  const session = await browser.newBrowserCDPSession();
  const samples = [];
  const failures = [];
  let pending = null;
  const read = async () => {
    const started = performance.now();

    try {
      const { processInfo } = await session.send('SystemInfo.getProcessInfo');
      const { stdout } = await execute('ps', ['-o', 'pid=,rss=', '-p', processInfo.map(({ id }) => id).join(',')]);
      const rss = new Map(
        stdout
          .trim()
          .split('\n')
          .map((line) => line.trim().split(/\s+/).map(Number)),
      );
      const processes = processInfo.map(({ id, type, cpuTime }) => ({
        id,
        type,
        cpuSeconds: cpuTime,
        residentBytes: rss.has(id) ? rss.get(id) * 1024 : null,
      }));

      samples.push({
        at: Date.now(),
        samplingMs: performance.now() - started,
        processes,
        summedResidentBytes: processes.reduce((sum, row) => sum + (row.residentBytes ?? 0), 0),
      });
    } catch (error) {
      failures.push(String(error));
    }
  };

  return {
    sample() {
      if (process.platform === 'win32') return Promise.resolve();

      pending ??= read().finally(() => {
        pending = null;
      });

      return pending;
    },
    summary: () => ({
      supported: process.platform !== 'win32',
      sampledPeakSummedResidentBytes: Math.max(0, ...samples.map((sample) => sample.summedResidentBytes)),
      samples,
      failures,
    }),
    async close() {
      await pending;
      await session.detach();
    },
  };
}
