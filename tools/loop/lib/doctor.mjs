export const STALL_MINUTES = 15;
export const COOLDOWN_MINUTES = 120;

const FAILED = /\] failed: /;

const FAILURES_PER_HOUR = 5;

const laneLines = (text) =>
  text
    .trim()
    .split('\n')
    .filter((line) => / \[[a-z]+-\d+\] /.test(line));

function failing(text, now) {
  const lines = laneLines(text);
  const recent = lines.slice(-3);
  const lastHour = lines.filter((line) => FAILED.test(line) && now - Date.parse(line.slice(0, 24)) < 3_600_000);

  return (recent.length === 3 && recent.every((line) => FAILED.test(line))) || lastHour.length >= FAILURES_PER_HOUR;
}

export const failingLanes = (logs, now = Date.now()) =>
  Object.entries(logs)
    .filter(([, text]) => failing(text, now))
    .map(([lane]) => lane);

export function shouldCall({ breaches, failing, stalledSince, lastCallAt, now }) {
  const cooled = !lastCallAt || now - lastCallAt > COOLDOWN_MINUTES * 60_000;
  const stalled = breaches.length > 0 && stalledSince && now - stalledSince > STALL_MINUTES * 60_000;

  return cooled && (failing.length > 0 || Boolean(stalled));
}
