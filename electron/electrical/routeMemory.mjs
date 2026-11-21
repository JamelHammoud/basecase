import { fileURLToPath } from 'node:url';
import { boardProcess } from './process.mjs';

export function routeMemory({ python, cwd, signal, metrics }) {
  return (pid, stop) => {
    let active = true;
    let pending = Promise.resolve();
    const inspect = async () => {
      const output = await boardProcess({
        command: python,
        args: [fileURLToPath(new URL('./routeMemory.py', import.meta.url)), String(pid)],
        cwd,
        signal,
      });
      const rss = JSON.parse(output).rss;

      if (!Number.isSafeInteger(rss) || rss < 0) throw new Error('board-route-limit');

      metrics.peakRssBytes = Math.max(metrics.peakRssBytes, rss);

      if (rss > 768 * 1024 * 1024) stop(new Error('board-route-limit'));
    };
    const timer = setInterval(() => {
      pending = pending.then(() => active && inspect()).catch(() => active && stop(new Error('board-route-limit')));
    }, 250);

    return async () => {
      active = false;
      clearInterval(timer);
      await pending;
    };
  };
}
