import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../lib/need';

export interface Entry {
  t: number;
  dir: 'in' | 'out' | 'inject' | 'meta';
  line?: string;
  dropped?: boolean;
  argv?: string[];
  pid?: number;
  daemonPid?: number;
  exit?: number | null;
}

export interface Wire {
  t: number;
  msg: Record<string, unknown>;
}

export interface Relay {
  executable: string;
  entries: () => Entry[];
  sent: () => Wire[];
  received: () => Wire[];
  starve: (on: boolean) => void;
  inject: (event: Record<string, unknown>) => void;
  argv: () => string[] | null;
  daemonPid: () => number | null;
  dispose: () => void;
}

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

const parse = (line: string | undefined): Record<string, unknown> | null => {
  try {
    return JSON.parse(line ?? '');
  } catch {
    return null;
  }
};

const wires = (entries: Entry[], dirs: Entry['dir'][], keepDropped: boolean): Wire[] =>
  entries
    .filter((e) => dirs.includes(e.dir) && (keepDropped || !e.dropped))
    .flatMap((e) => {
      const msg = parse(e.line);

      return msg ? [{ t: e.t, msg }] : [];
    });

export function makeRelay(daemon: string): Relay {
  if (process.platform === 'win32') throw new Error('The relay runs on macOS and Linux only.');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-relay-'));
  const control = path.join(dir, 'control');
  const log = path.join(dir, 'wire.jsonl');
  const executable = path.join(dir, 'robot-daemon');
  const env = `RELAY_DAEMON=${quote(daemon)} RELAY_CONTROL=${quote(control)} RELAY_LOG=${quote(log)}`;

  fs.mkdirSync(control);
  fs.writeFileSync(log, '');
  fs.writeFileSync(
    executable,
    `#!/bin/sh\n${env} exec ${quote(process.execPath)} ${quote(repoPath('verify', 'hw', 'relay.mjs'))} "$@"\n`,
  );
  fs.chmodSync(executable, 0o700);

  const entries = (): Entry[] =>
    fs
      .readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  const meta = () => entries().filter((e) => e.dir === 'meta' && e.argv);
  let injected = 0;

  return {
    executable,
    entries,
    sent: () => wires(entries(), ['in'], false),
    received: () => wires(entries(), ['out', 'inject'], true),
    starve: (on) => (on ? fs.writeFileSync(path.join(control, 'starve'), '') : fs.rmSync(path.join(control, 'starve'))),
    inject: (event) => {
      injected += 1;
      fs.writeFileSync(path.join(control, `inject-${String(injected).padStart(4, '0')}.json`), JSON.stringify(event));
    },
    argv: () => meta().at(-1)?.argv ?? null,
    daemonPid: () => meta().at(-1)?.daemonPid ?? null,
    dispose: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

export const daemonEvents = (relay: Relay, kind: string) => relay.received().filter((w) => w.msg.event === kind);

type Maybe<T> = T | null | undefined | false;

export async function waitFor<T>(what: string, read: () => Maybe<T> | Promise<Maybe<T>>, ms = 15000): Promise<T> {
  const deadline = Date.now() + ms;

  for (;;) {
    const value = await read();

    if (value) return value;

    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
