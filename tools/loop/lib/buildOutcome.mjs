import { availableCapabilities, REQUIREMENTS } from './capabilities.mjs';

export const buildSchema = (schema) => ({
  ...schema,
  properties: {
    ...schema.properties,
    outcome: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['complete', 'incomplete', 'blocked', 'declined'] },
        reason: { type: 'string', description: 'Concrete remaining work, demonstrated block or reason not to ship' },
        evidence: { type: 'array', items: { type: 'string' }, description: 'Check results or retained evidence paths' },
        dependencies: { type: 'array', items: { type: 'integer' }, description: 'Blocking pull request numbers only' },
        capabilities: { type: 'array', items: { type: 'string', enum: REQUIREMENTS } },
      },
      required: ['status', 'reason', 'evidence', 'dependencies', 'capabilities'],
    },
  },
  required: [...(schema.required ?? []), 'outcome'],
});

const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());
const numbers = (value) => Array.isArray(value) && value.every((item) => Number.isInteger(item) && item > 0);
const validShape = (outcome) =>
  outcome &&
  ['complete', 'incomplete', 'blocked', 'declined'].includes(outcome.status) &&
  typeof outcome.reason === 'string' &&
  strings(outcome.evidence) &&
  numbers(outcome.dependencies) &&
  strings(outcome.capabilities) &&
  outcome.capabilities.every((item) => REQUIREMENTS.includes(item));

const invalid = (reason) => ({
  status: 'incomplete',
  reason: `Invalid build outcome: ${reason}. Original acceptance remains unresolved.`,
  evidence: [],
  dependencies: [],
  capabilities: [],
});

export function buildOutcome(output, openNumbers) {
  const outcome = output?.outcome;

  if (typeof output?.changed !== 'boolean' || !validShape(outcome))
    return invalid('missing or malformed structured outcome');

  if ((outcome.status === 'complete') !== (output.changed === true))
    return invalid('changed disagrees with completion');

  const blocked = outcome.dependencies.length > 0 || outcome.capabilities.length > 0;

  if (blocked !== (outcome.status === 'blocked')) return invalid('block evidence disagrees with status');

  if (outcome.status !== 'complete' && (!outcome.reason.trim() || outcome.evidence.length === 0))
    return invalid('unfinished outcome has no reason or evidence');

  if (outcome.dependencies.some((number) => !openNumbers.has(number)))
    return invalid('dependency is not an open pull request');

  if (outcome.capabilities.some((capability) => availableCapabilities().includes(capability)))
    return invalid('claimed missing capability is available');

  return outcome;
}
