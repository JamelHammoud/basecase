import { isAuthError } from './agentSelection.mjs';

const CLASS_NAMES = /^(?:\w*(?:Error|Exception): )+/;

export const NOT_CONNECTED = 'Agent isn’t connected. Set one up in Settings ▸ Agent.';

const isProtocolError = (err) => Number.isInteger(err?.code);

const plainText = (err) =>
  String(err?.message ?? err ?? '')
    .replace(CLASS_NAMES, '')
    .trim();

export function agentFailure(err, agentName) {
  if (isAuthError(err)) return `Sign in to ${agentName} from the Agent tab.`;

  if (isProtocolError(err)) return `${agentName} stopped on an error. Choose another agent in Settings ▸ Agent.`;

  return plainText(err) || `${agentName} stopped responding.`;
}

export const plainAgentError = (err, agentName) => new Error(agentFailure(err, agentName));
