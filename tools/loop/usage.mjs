import { pause, resume } from './lib/usage.mjs';

const [command = 'status'] = process.argv.slice(2);
const describe = (state) =>
  state
    ? `paused since ${new Date(state.since).toLocaleString()}, until ${new Date(state.until).toLocaleString()} or the next successful check`
    : 'running';

if (command === 'resume') {
  resume();
  console.log('Resumed. Agent lanes start on their next run.');
} else if (command === 'status') console.log(describe(pause()));
else console.log('Usage: node tools/loop/usage.mjs <status|resume>');
