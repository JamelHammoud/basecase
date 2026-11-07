import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [daemon, control, log] = [process.env.RELAY_DAEMON, process.env.RELAY_CONTROL, process.env.RELAY_LOG];
const started = performance.now();
const STARVED = new Set(['heartbeat', 'intent']);

const write = (entry) => fs.appendFileSync(log, `${JSON.stringify({ t: performance.now() - started, ...entry })}\n`);

const child = spawn(daemon, process.argv.slice(2), { stdio: ['pipe', 'pipe', 'inherit'] });

write({ dir: 'meta', argv: process.argv.slice(2), pid: process.pid, daemonPid: child.pid });

const starving = () => fs.existsSync(path.join(control, 'starve'));

const commandOf = (line) => {
  try {
    return JSON.parse(line).cmd;
  } catch {
    return undefined;
  }
};

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const dropped = starving() && STARVED.has(commandOf(line));

  write({ dir: 'in', line, dropped });

  if (!dropped) child.stdin.write(`${line}\n`);
});

process.stdin.on('end', () => {
  write({ dir: 'meta', stdin: 'closed' });
  child.stdin.end();
});

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  write({ dir: 'out', line });
  process.stdout.write(`${line}\n`);
});

const inject = setInterval(() => {
  const files = fs
    .readdirSync(control)
    .filter((f) => f.startsWith('inject-'))
    .sort();

  for (const f of files) {
    const file = path.join(control, f);
    const line = fs.readFileSync(file, 'utf8').trim();

    fs.rmSync(file);
    write({ dir: 'inject', line });
    process.stdout.write(`${line}\n`);
  }
}, 20);

child.on('exit', (code, signal) => {
  clearInterval(inject);
  write({ dir: 'meta', exit: code, signal });
  process.exit(signal ? 1 : (code ?? 1));
});
