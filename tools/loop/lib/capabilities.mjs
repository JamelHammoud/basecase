import { fingerprint } from './sessionJournal.mjs';
import { store } from './store.mjs';

export const AVAILABLE = ['macos-host', 'linux-container', 'linux-ci', 'windows-ci', 'repository', 'web'];
export const REQUIREMENTS = [
  ...AVAILABLE,
  'windows-host',
  'physical-robot',
  'physical-printer',
  'ios-device',
  'cuda-gpu',
];

const requiredLine = /^Requires:\s*(.+)$/im;
const needsWindowsHost =
  /(?:requires?|needs?|resume on|continue on|reproduce on|access to|on) (?:an? |the |live |interactive )?Windows (?:execution )?(?:host|machine|desktop|target)/i;
const rejections = store('capability-rejections', {});

export const availableCapabilities = () => [
  ...new Set([...AVAILABLE, ...(process.env.BASECASE_LOOP_CAPABILITIES ?? '').split(',').filter(Boolean)]),
];

export function taskRequirements(task) {
  if (Array.isArray(task.requires)) return task.requires;

  const declared = requiredLine.exec(task.body ?? '')?.[1];

  if (declared)
    return declared
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  return needsWindowsHost.test(`${task.title ?? ''}\n${task.body ?? ''}`) ? ['windows-host'] : [];
}

export function unavailableCapabilities(task, available = availableCapabilities()) {
  const required = taskRequirements(task);
  const inferred = needsWindowsHost.test(`${task.title ?? ''}\n${task.body ?? ''}`) ? ['windows-host'] : [];

  return [...new Set([...required, ...inferred])].filter((item) => !available.includes(item));
}

export const eligibleTask = (task) => unavailableCapabilities(task).length === 0;

export function acceptTask(task) {
  const missing = unavailableCapabilities(task);

  if (missing.length === 0) return true;

  const key = fingerprint({ title: task.title, body: task.body });

  rejections.save(key, { title: task.title, missing, at: Date.now() });

  return false;
}

export const withRequirements = (body, requirements) =>
  requiredLine.test(body) ? body : `Requires: ${(requirements ?? []).join(', ') || 'repository'}\n${body}`;
