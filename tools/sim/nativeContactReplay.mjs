import { spawn } from 'node:child_process';
import { findOnPath } from '../../electron/executables.mjs';

const runtimes = new Map();

function startRuntime(version) {
  const child = spawn(
    findOnPath('uv'),
    [
      'run',
      '--no-project',
      '--with',
      `mujoco-core==${version}`,
      'python',
      '-u',
      'tools/sim/contactReference.py',
      '--stream',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const pending = [];
  let buffer = '';
  let stderr = '';
  let failure;
  let acceptReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    acceptReady = resolve;
    rejectReady = reject;
  });
  const fail = (error) => {
    failure = error;
    rejectReady(error);
    pending.splice(0).forEach(({ reject }) => reject(error));
  };
  const receive = (line) => {
    try {
      const message = JSON.parse(line);

      if (message.ready && message.version === version) return acceptReady();

      if (message.ready) throw new Error(`Native MuJoCo version ${message.version} differs from ${version}`);

      const request = pending.shift();

      if (!request) throw new Error('Native MuJoCo returned an unexpected response');

      request.resolve(message);
    } catch (error) {
      fail(error);
      child.kill();
    }
  };

  child.stdout.on('data', (chunk) => {
    buffer += chunk;

    if (buffer.length > 4 * 1024 * 1024) {
      fail(new Error('Native MuJoCo response exceeds its size limit'));
      child.kill();

      return;
    }

    const lines = buffer.split('\n');

    buffer = lines.pop();
    lines.filter(Boolean).forEach(receive);
  });
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.on('error', fail);
  child.stdin.on('error', fail);

  const closed = new Promise((resolve) =>
    child.on('close', (code) => {
      fail(new Error(`Native MuJoCo closed (${code}): ${stderr}`));
      resolve();
    }),
  );

  return {
    ready,
    request: (replay) =>
      new Promise((resolve, reject) => {
        if (failure) return reject(failure);

        pending.push({ resolve, reject });
        child.stdin.write(`${JSON.stringify([replay])}\n`);
      }),
    close: async () => {
      child.stdin.end();
      await closed;
    },
  };
}

const runtimeFor = (version) => {
  if (!runtimes.has(version)) runtimes.set(version, startRuntime(version));

  return runtimes.get(version);
};

export const prepareNativeContactReplay = async (version) => runtimeFor(version).ready;

export async function nativeContactReplay(replay, version) {
  const runtime = runtimeFor(version);

  await runtime.ready;

  return runtime.request(replay);
}

export async function closeNativeContactReplays() {
  const closing = [...runtimes.values()].map((runtime) => runtime.close());

  runtimes.clear();
  await Promise.all(closing);
}
