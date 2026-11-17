import type { ElectricalInput } from './electricalTypes';
import type { BoardRoutedSource } from './boardRoutingTypes';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const dimension = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10);

const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

export function validFabricationRules(value: unknown) {
  return (
    value === null ||
    (object(value) &&
      onlyKeys(value, ['source', 'clearanceMm', 'trackWidthMm', 'drillMm']) &&
      typeof value.source === 'string' &&
      value.source.length <= 512 &&
      dimension(value.clearanceMm) &&
      dimension(value.trackWidthMm) &&
      dimension(value.drillMm))
  );
}

export function validRoutedRecord(value: unknown): value is BoardRoutedSource {
  if (!object(value)) return false;

  return (
    onlyKeys(value, ['schema', 'hash', 'pcb', 'sourceFingerprint', 'rules', 'evidence', 'provenance']) &&
    value.schema === 1 &&
    hash(value.hash) &&
    hash(value.sourceFingerprint) &&
    typeof value.pcb === 'string' &&
    value.pcb.length <= 8 * 1024 * 1024 &&
    validFabricationRules(value.rules) &&
    (value.provenance === undefined || validProvenance(value.provenance)) &&
    (value.evidence === undefined || validEvidence(value.evidence))
  );
}

function validProvenance(value: unknown) {
  return (
    object(value) &&
    onlyKeys(value, ['engine', 'version', 'artifactHash', 'runtime', 'dsnHash', 'sesHash']) &&
    value.engine === 'freerouting' &&
    value.version === '2.1.0' &&
    value.runtime === '21.0.13' &&
    hash(value.artifactHash) &&
    hash(value.dsnHash) &&
    hash(value.sesHash)
  );
}

function validEvidence(value: unknown) {
  if (!object(value) || !object(value.metrics)) return false;

  return (
    onlyKeys(value, ['key', 'version', 'issues', 'report', 'metrics']) &&
    hash(value.key) &&
    (value.version === null ||
      (typeof value.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}[A-Za-z0-9.+_-]{0,24}$/u.test(value.version))) &&
    Array.isArray(value.issues) &&
    value.issues.length <= 64 &&
    value.issues.every((item) => typeof item === 'string' && /^board-[a-z-]{1,60}$/u.test(item)) &&
    (value.report === null || (typeof value.report === 'string' && value.report.length <= 4 * 1024 * 1024)) &&
    validMetrics(value.metrics)
  );
}

function validMetrics(value: Record<string, unknown>) {
  return (
    onlyKeys(value, ['cliMs', 'outputBytes']) &&
    typeof value.cliMs === 'number' &&
    Number.isFinite(value.cliMs) &&
    value.cliMs >= 0 &&
    typeof value.outputBytes === 'number' &&
    Number.isFinite(value.outputBytes) &&
    value.outputBytes >= 0 &&
    value.outputBytes <= 16 * 1024 * 1024
  );
}

export function routingInput(input: ElectricalInput): ElectricalInput {
  const board = input.project.electronicsBoard;

  if (!board?.routed) return input;

  const definition = { ...board };

  delete definition.routed;

  return { ...input, project: { ...input.project, electronicsBoard: definition } };
}
