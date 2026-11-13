const MODELS = String.raw`\b(claude|codex|gemini|copilot|cursor|chatgpt|gpt-?\d*|openai|anthropic|llm|ai)\b`;
const BOT_ADDRESS = /noreply@anthropic\.com|@anthropic\.com|@openai\.com|\[bot\]@users\.noreply\.github\.com/i;

const CREDIT_LINES = [
  new RegExp(String.raw`^\s*co-authored-by:.*${MODELS}`, 'i'),
  /^\s*co-authored-by:.*(noreply@anthropic\.com|\[bot\])/i,
  new RegExp(String.raw`generated (with|by)\b.*${MODELS}`, 'i'),
  /🤖.*generated|generated.*🤖/iu,
  /noreply@anthropic\.com/i,
];

const MODEL_NAMES = /^(claude( code)?|codex|gemini( cli)?|(github )?copilot|chatgpt|cursor( agent)?|openai codex)$/i;

export const creditProblems = (message) =>
  message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .filter((line) => CREDIT_LINES.some((pattern) => pattern.test(line)))
    .map((line) => line.trim());

export const identityProblem = ({ name, email }) =>
  MODEL_NAMES.test(name.trim()) || BOT_ADDRESS.test(email) ? `${name} <${email}>` : null;
