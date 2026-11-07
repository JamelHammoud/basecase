import type { Page } from 'playwright-core';
import type { Wire } from './relayHarness';

export const LADDER = ['look', 'set_up', 'test', 'rehearse', 'first_run', 'policy', 'longer_runs'];
export const COMMANDS = new Set(['enter', 'intent', 'heartbeat', 'stop', 'fall', 'release', 'clear_fault', 'recheck']);
export const MAX_SILENCE_MS = 100;
export const MAX_MEDIAN_GAP_MS = 60;

const LIVENESS = new Set(['heartbeat', 'intent']);
const STALE_CODES = new Set(['client_lost', 'intent_stale']);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)] ?? Infinity;
}

export function heartbeatProblems(sent: Wire[], received: Wire[], window: { from: number; until: number }): string[] {
  const inside = (w: Wire) => w.t >= window.from && w.t <= window.until;
  const beats = sent.filter((w) => inside(w) && LIVENESS.has(String(w.msg.cmd))).map((w) => w.t);
  const edges = [window.from, ...beats, window.until];
  const gaps = edges.slice(1).map((t, i) => t - edges[i]);
  const stale = received.filter((w) => inside(w) && w.msg.event === 'fault' && STALE_CODES.has(String(w.msg.code)));
  const problems: string[] = [];

  if (Math.max(...gaps) >= MAX_SILENCE_MS) problems.push(`The app went ${Math.max(...gaps).toFixed(0)} ms silent`);

  if (median(gaps) > MAX_MEDIAN_GAP_MS) problems.push(`Median heartbeat gap ${median(gaps).toFixed(0)} ms`);

  if (stale.length) problems.push(`The daemon stopped the robot: ${stale.map((w) => w.msg.code).join(', ')}`);

  return problems;
}

const modeAt = (received: Wire[], t: number) => {
  const known = received.filter((w) => w.t <= t && typeof w.msg.mode === 'string' && w.msg.event !== 'completed');

  return String(known.at(-1)?.msg.mode ?? 'look');
};

const isNextRung = (from: string, to: string) => to === 'look' || LADDER.indexOf(to) === LADDER.indexOf(from) + 1;

export function ladderProblems(sent: Wire[], received: Wire[]): string[] {
  const problems: string[] = [];
  const enters = sent.filter((w) => w.msg.cmd === 'enter');

  for (const w of sent.filter((x) => !COMMANDS.has(String(x.msg.cmd)))) {
    problems.push(`Undocumented command: ${JSON.stringify(w.msg)}`);
  }

  for (const w of enters) {
    const from = modeAt(received, w.t);

    if (!isNextRung(from, String(w.msg.mode))) problems.push(`Asked to skip from ${from} to ${w.msg.mode}`);
  }

  const changes = received.filter((w) => w.msg.event === 'mode');

  changes.forEach((w, i) => {
    const before = i ? String(changes[i - 1].msg.mode) : 'look';
    const climbed = LADDER.indexOf(String(w.msg.mode)) > LADDER.indexOf(before);
    const asked = enters.some((e) => e.msg.mode === w.msg.mode && e.t <= w.t && (!i || e.t >= changes[i - 1].t));

    if (climbed && !asked) problems.push(`Climbed to ${w.msg.mode} without an enter`);
  });

  return problems;
}

export function textVisible(page: Page, text: string): Promise<boolean> {
  return page.evaluate((wanted) => {
    const holders = [...document.querySelectorAll<HTMLElement>('body *')].filter(
      (el) =>
        el.innerText?.includes(wanted) && ![...el.children].some((c) => (c as HTMLElement).innerText?.includes(wanted)),
    );

    return holders.some((el) => {
      const box = el.getBoundingClientRect();
      const onScreen = box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0;
      const inView = box.top < window.innerHeight && box.left < window.innerWidth;
      const shown = el.checkVisibility({ opacityProperty: true, visibilityProperty: true });

      return shown && onScreen && inView && !el.closest('[inert]');
    });
  }, text);
}

export function hideText(page: Page, text: string): Promise<number> {
  return page.evaluate((wanted) => {
    const holders = [...document.querySelectorAll<HTMLElement>('body *')].filter(
      (el) =>
        el.innerText?.includes(wanted) && ![...el.children].some((c) => (c as HTMLElement).innerText?.includes(wanted)),
    );

    for (const el of holders) el.style.setProperty('display', 'none', 'important');

    return holders.length;
  }, text);
}

export const nonce = (label: string) => `${label} ${Math.random().toString(36).slice(2, 8)}.`;
