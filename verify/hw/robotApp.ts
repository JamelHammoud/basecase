import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { appResources, packagedBinary } from '../../e2e/app/packagedApp';
import { openPlayTab } from '../../e2e/harness';

export const DAEMON_ENV = 'BASECASE_ROBOT_DAEMON';
export const DAEMON_FILE = process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon';

export interface ConnectSpec {
  family: 'feetech' | 'dynamixel';
  ids: number[];
  class: 'arm' | 'legged';
  emulated: true;
}

export const EMULATED_ARM: ConnectSpec = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };

export type ConnectReply = { ok: true } | { ok: false; message: string };

export const bundledDaemon = () => path.join(path.dirname(appResources(packagedBinary())), 'hw', DAEMON_FILE);

export const connect = (page: Page, spec: unknown): Promise<ConnectReply> =>
  page.evaluate(async (s) => {
    const api = (window as unknown as { electronAPI: { robotConnect: (x: unknown) => Promise<ConnectReply> } })
      .electronAPI;

    return api.robotConnect(s);
  }, spec);

export const disconnect = (page: Page): Promise<unknown> =>
  page.evaluate(() =>
    (window as unknown as { electronAPI: { robotDisconnect: () => Promise<unknown> } }).electronAPI.robotDisconnect(),
  );

export interface Proc {
  pid: number;
  ppid: number;
  args: string;
}

function windowsProcesses(): Proc[] {
  const json = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  return (JSON.parse(json) as Array<{ ProcessId: number; ParentProcessId: number; CommandLine: string | null }>).map(
    (p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, args: p.CommandLine ?? '' }),
  );
}

export function processes(): Proc[] {
  if (process.platform === 'win32') return windowsProcesses();

  return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,args='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .flatMap((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);

      return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }] : [];
    });
}

export function descendants(root: number, all = processes()): Proc[] {
  const found: Proc[] = [];
  let frontier = [root];

  while (frontier.length) {
    const next = all.filter((p) => frontier.includes(p.ppid));

    found.push(...next);
    frontier = next.map((p) => p.pid);
  }

  return found;
}

export const daemonsUnder = (root: number) =>
  descendants(root).filter((p) => p.args.includes(DAEMON_FILE) && !p.args.includes('relay.mjs'));

export const openOperate = (page: Page) => openPlayTab(page, 'Operate');

export const mode = (page: Page) =>
  page.locator('[data-testid="robot-mode"]:visible').first().getAttribute('data-mode', { timeout: 1000 });

export async function climb(page: Page, rung: string) {
  await page.locator(`[data-robot-rung="${rung}"]:visible`).first().click();
}
