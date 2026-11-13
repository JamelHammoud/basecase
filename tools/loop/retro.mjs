import { retroEvidence } from './lib/retroEvidence.mjs';
import { retroText } from './lib/retroText.mjs';

const [command = 'evidence'] = process.argv.slice(2);

if (command === 'evidence') console.log(retroText(retroEvidence()));
else if (command === 'json') console.log(JSON.stringify(retroEvidence(), null, 2));
else console.log('Usage: node tools/loop/retro.mjs <evidence|json>');
