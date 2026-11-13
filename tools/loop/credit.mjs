const CREDIT_LINES = [
  /^\s*co-authored-by:/i,
  /generated (with|by) .*(claude|codex|gemini|copilot|cursor|chatgpt|gpt|llm|ai)/i,
  /🤖/u,
  /noreply@anthropic\.com/i,
];

const MODEL_IDENTITIES = /(anthropic|claude|openai|codex|gemini|copilot|chatgpt|\[bot\]@)/i;

export const creditProblems = (message) =>
  message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .filter((line) => CREDIT_LINES.some((pattern) => pattern.test(line)))
    .map((line) => line.trim());

export const identityProblem = ({ name, email }) =>
  MODEL_IDENTITIES.test(`${name} <${email}>`) ? `${name} <${email}>` : null;
