import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_NAME = 'Bambu Connect.app';
const INSTALL_MESSAGE = 'Install Bambu Connect from bambulab.com, then try again.';
const CONTROL_MESSAGE = 'Control this print in Bambu Connect.';

export function bambuConnectUrl(file, name) {
  const query = `path=${encodeURIComponent(file)}&name=${encodeURIComponent(name)}&version=1.0.0`;

  return `bambu-connect://import-file?${query}`;
}

export function openerFor(platform, url) {
  if (platform === 'darwin') return ['open', [url]];

  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];

  return ['xdg-open', [url]];
}

function defaultRun(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => (error ? reject(error) : resolve()));
  });
}

function installed(platform, exists) {
  if (platform !== 'darwin') return true;

  return [path.join('/Applications', APP_NAME), path.join(os.homedir(), 'Applications', APP_NAME)].some(exists);
}

export function createBambuConnect(
  _printer,
  { run = defaultRun, platform = process.platform, exists = fs.existsSync } = {},
) {
  const refuse = async () => {
    throw new Error(CONTROL_MESSAGE);
  };

  return {
    kind: 'bambu-connect',
    canStatus: false,
    canStart: false,
    async test() {
      if (!installed(platform, exists)) return { ok: false, message: INSTALL_MESSAGE };

      return { ok: true, message: 'Prints open in Bambu Connect' };
    },
    async status() {
      return { state: 'idle' };
    },
    async send({ file, name }) {
      if (!installed(platform, exists)) throw new Error(INSTALL_MESSAGE);

      const [command, args] = openerFor(platform, bambuConnectUrl(file, name ?? path.basename(file)));

      try {
        await run(command, args);
      } catch (error) {
        throw new Error(`Couldn’t open Bambu Connect. ${INSTALL_MESSAGE}`, { cause: error });
      }

      return { started: false, message: 'Opened in Bambu Connect' };
    },
    pause: refuse,
    resume: refuse,
    cancel: refuse,
    close() {},
  };
}
