import { setTimeout as sleep } from 'node:timers/promises';
import { frameOf } from './frame.mjs';

export const SESSION = Object.freeze({
  settleMs: 400,
  maxWaitS: 10,
  treeChars: 40000,
  maxFindings: 12,
  nearPx: 12,
  warnS: 60,
});

const finite = (v) => Number.isFinite(Number(v));

function sameFinding(a, b) {
  const near = a.at && b.at && Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) <= SESSION.nearPx;

  return Boolean(near) || a.where.toLowerCase() === b.where.toLowerCase();
}

export function addFinding(findings, raw) {
  const where = String(raw.where ?? '').trim();
  const problem = String(raw.problem ?? '').trim();
  const at = raw.at && raw.at.every(finite) ? raw.at.map((v) => Math.round(Number(v))) : undefined;

  if (!where || !problem) return 'A finding needs where and problem.';

  if (findings.length >= SESSION.maxFindings) return 'Finding limit reached. Report only the clearest problems.';

  const finding = { where, problem, ...(at ? { at } : {}) };

  if (findings.some((f) => sameFinding(f, finding))) return `Already reported ${where}.`;

  findings.push(finding);

  return `Recorded ${findings.length}: ${where}.`;
}

export function withdrawFinding(findings, where) {
  const name = String(where ?? '')
    .trim()
    .toLowerCase();
  const index = findings.findIndex((f) => f.where.toLowerCase() === name);

  if (index < 0) return `No finding named ${where}.`;

  findings.splice(index, 1);

  return `Withdrew ${where}.`;
}

export function createSession({ screen, minutes, devicePixelRatio, now = Date.now }) {
  const deadline = now() + minutes * 60000;
  const state = { toCss: 1, done: false, actions: 0 };
  const findings = [];
  const timeLeft = () => Math.max(0, deadline - now());
  const clock = () => {
    const left = Math.round(timeLeft() / 1000);

    if (left <= SESSION.warnS) return `${left} s left. Time is nearly up: report what you found, then call finish.`;

    return `${left} s left.`;
  };
  const css = (v) => Math.round(Number(v) * state.toCss);

  const look = async () => {
    const frame = await frameOf(await screen.screenshot(), devicePixelRatio);

    state.toCss = frame.toCss;

    return { image: frame.data, text: `Screenshot ${frame.width} × ${frame.height}. ${clock()}` };
  };

  const after = async (action) => {
    if (!timeLeft()) return { text: 'Time is up. Report what you found, then call finish.' };

    state.actions += 1;
    await action();
    await sleep(SESSION.settleMs);

    return look();
  };

  const handlers = {
    look,
    tree: async () => ({ text: (await screen.accessibilityTree()).slice(0, SESSION.treeChars) }),
    click: ({ x, y }) => after(() => screen.click(css(x), css(y))),
    type: ({ text }) => after(() => screen.type(String(text))),
    press: ({ key }) => after(() => screen.press(String(key))),
    scroll: ({ dy }) => after(() => screen.scroll(0, Number(dy) || 0)),
    wait: async ({ seconds }) => {
      await sleep(Math.min(SESSION.maxWaitS, Math.max(0, Number(seconds) || 0)) * 1000);

      return look();
    },
    report: ({ where, x, y, problem }) => {
      const at = finite(x) && finite(y) ? [css(x), css(y)] : undefined;

      return { text: `${addFinding(findings, { where, problem, at })} ${clock()}` };
    },
    withdraw: ({ where }) => ({ text: withdrawFinding(findings, where) }),
    finish: () => {
      state.done = true;

      return { text: 'Session finished.' };
    },
  };

  return { deadline, findings, state, timeLeft, handlers };
}
