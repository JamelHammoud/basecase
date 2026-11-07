import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { bundleEntry, openKernelSession } from './kernelSession.mjs';
import { openKernelWindow } from './kernelWindow.mjs';
import { checkedRenderJob, renderTimeout } from './policy.mjs';
import { KernelPool } from './pool.mjs';

const POOL_SIZE = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
const MEMORY_LIMIT_BYTES = 4 * 1024 * 1024 * 1024;
const AUDIT_TIMEOUT_MS = 60000;
const WARM_DELAY_MS = 2000;

function memoryOf(pid) {
  const metric = app.getAppMetrics().find((m) => m.pid === pid);

  return (metric?.memory.workingSetSize ?? 0) * 1024;
}

export class SandboxKernel {
  constructor({ root }) {
    this.root = root;
    this.bundleDir = path.join(root, 'dist', 'kernel');
    this.session = null;
    this.windows = new Set();
    this.pool = new KernelPool({
      size: POOL_SIZE,
      memoryLimitBytes: MEMORY_LIMIT_BYTES,
      memoryOf,
      openSlot: (handlers) => this.openSlot(handlers),
    });
  }

  openSlot(handlers) {
    if (!fs.existsSync(bundleEntry(this.bundleDir))) throw new Error('its bundle is missing from this build');

    this.session ??= openKernelSession({ root: this.root, bundleDir: this.bundleDir });

    const channel = openKernelWindow({ session: this.session, handlers });

    this.windows.add(channel.window);
    channel.window.once('closed', () => this.windows.delete(channel.window));

    return channel;
  }

  owns(window) {
    return this.windows.has(window);
  }

  render(payload) {
    return this.pool.submit(checkedRenderJob(payload), renderTimeout(payload));
  }

  audit(body) {
    return this.pool.submit({ json: body }, AUDIT_TIMEOUT_MS);
  }

  warm() {
    setTimeout(() => this.pool.warm(), WARM_DELAY_MS).unref();
  }

  stop() {
    this.pool.stop();
  }
}
