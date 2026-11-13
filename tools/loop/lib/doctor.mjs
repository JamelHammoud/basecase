export const STALL_MINUTES = 45;
export const COOLDOWN_MINUTES = 120;

const FAILED = /\] failed: /;

export function failingLanes(logs) {
  return Object.entries(logs)
    .filter(([, text]) => {
      const lines = text
        .trim()
        .split('\n')
        .filter((line) => / \[[a-z]+-\d+\] /.test(line));
      const recent = lines.slice(-3);

      return recent.length === 3 && recent.every((line) => FAILED.test(line));
    })
    .map(([lane]) => lane);
}

export function shouldCall({ breaches, failing, stalledSince, lastCallAt, now }) {
  const cooled = !lastCallAt || now - lastCallAt > COOLDOWN_MINUTES * 60_000;
  const stalled = breaches.length > 0 && stalledSince && now - stalledSince > STALL_MINUTES * 60_000;

  return cooled && (failing.length > 0 || Boolean(stalled));
}
