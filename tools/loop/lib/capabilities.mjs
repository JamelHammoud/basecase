import { fingerprint } from './sessionJournal.mjs';
import { store } from './store.mjs';

export const AVAILABLE = ['macos-host', 'linux-container', 'linux-ci', 'windows-ci', 'repository', 'web'];
export const REQUIREMENTS = [
  ...AVAILABLE,
  'windows-host',
  'windows-diagnostics',
  'physical-robot',
  'physical-printer',
  'ios-device',
  'cuda-gpu',
];

const requiredLine = /^Requires:\s*(.+)$/im;
const needsWindowsHost =
  /(?:requires?|needs?|resume on|continue on|reproduce on|access to|on) (?:an? |the |live |interactive )?Windows (?:execution )?(?:host|machine|desktop|target)/i;
const measurements =
  /(?:\bten\b|\b10\b)[^.\n]{0,100}\b(?:before|baseline)\b[^.\n]{0,120}\b(?:after|fixed)\b|\b(?:before|baseline)\b[^.\n]{0,80}(?:\bten\b|\b10\b)[^.\n]{0,120}\b(?:after|fixed)\b/i;
const windowsExecution = /\bWindows(?:\s+CI)?\s+(?:run|runner|execution|diagnostic|experiment|process trac)/i;
const rejections = store('capability-rejections', {});

export const availableCapabilities = () => [
  ...new Set([
    ...AVAILABLE,
    ...(process.env.BASECASE_LOOP_CAPABILITIES ?? '')
      .split(',')
      .filter(Boolean)
      .flatMap((capability) => (capability === 'windows-host' ? [capability, 'windows-diagnostics'] : [capability])),
  ]),
];

export const taskKey = (task) => fingerprint({ title: task.title, body: task.body });

const existingEvidence = (paragraph) =>
  /\b(?:existing|retained|published)\s+(?:logs|traces|results)\b/i.test(paragraph) &&
  !/\b(?:collect|execute|capture|reproduce|measure)\b/i.test(paragraph);

function needsWindowsDiagnostics(task) {
  const title = /\bWindows\b/i.test(task.title ?? '');

  return String(task.body ?? '')
    .split(/\n\s*\n/)
    .some(
      (paragraph) =>
        !existingEvidence(paragraph) &&
        measurements.test(paragraph) &&
        (windowsExecution.test(paragraph) || (title && !/\b(?:Linux|macOS)\b/i.test(paragraph))),
    );
}

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
  const inferred = [
    ...(needsWindowsHost.test(`${task.title ?? ''}\n${task.body ?? ''}`) ? ['windows-host'] : []),
    ...(needsWindowsDiagnostics(task) ? ['windows-diagnostics'] : []),
  ];

  return [...new Set([...required, ...inferred])].filter((item) => !available.includes(item));
}

export const eligibleTask = (task) => unavailableCapabilities(task).length === 0;

export function acceptTask(task) {
  const missing = unavailableCapabilities(task);

  if (missing.length === 0) return true;

  const key = taskKey(task);

  rejections.save(key, { title: task.title, missing, at: Date.now() });

  return false;
}

export const withRequirements = (body, requirements) =>
  requiredLine.test(body) ? body : `Requires: ${(requirements ?? []).join(', ') || 'repository'}\n${body}`;
