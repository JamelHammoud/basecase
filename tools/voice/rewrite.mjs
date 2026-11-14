import { rewriteFile } from './voice.mjs';

for (const file of process.argv.slice(2)) console.log(`${file}: ${rewriteFile(file) ? 'rewritten' : 'left as it was'}`);
