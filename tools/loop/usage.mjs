import { CODEX_EFFORT, CODEX_MODEL } from './lib/codex.mjs';
import { codexPause, isActive, pause, resume, resumeCodex } from './lib/usage.mjs';

const [command = 'status'] = process.argv.slice(2);
const until = (state) => new Date(state.until).toLocaleString();

function status() {
  const claude = pause();
  const codex = codexPause();

  if (!isActive(claude)) return 'Agent lanes run on Claude.';

  if (isActive(codex))
    return `Claude and Codex are both at their limits; agent lanes are paused until ${until(codex)}.`;

  return `Claude is at its limit until ${until(claude)}; agent lanes run on Codex (${CODEX_MODEL}, ${CODEX_EFFORT}).`;
}

if (command === 'resume') {
  resume();
  resumeCodex();
  console.log('Agent lanes go back to Claude on their next run.');
} else if (command === 'status') console.log(status());
else console.log('Usage: node tools/loop/usage.mjs <status|resume>');
