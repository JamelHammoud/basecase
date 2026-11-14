import readline from 'node:readline';

const WATCHDOG_MS = 100;
const LIVENESS = new Set(['heartbeat', 'intent']);
const args = process.argv.slice(2);
const ids = (args[args.indexOf('--ids') + 1] ?? '1').split(',').map(Number);
let mode = 'look';
let lastBeat = null;
let faulted = false;

const say = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

const status = () =>
  say({
    event: 'status',
    mode,
    run: mode === 'test' ? 'running' : 'idle',
    joints: ids.map((id) => ({ id, position: 2048 })),
  });

function beat() {
  const now = performance.now();

  if (mode === 'test' && lastBeat !== null && now - lastBeat > WATCHDOG_MS && !faulted) {
    faulted = true;
    say({
      event: 'fault',
      code: 'client_lost',
      message: 'The app stopped talking to the robot.',
      gap_ms: now - lastBeat,
    });
  }

  lastBeat = now;
}

function enter(next) {
  mode = next;
  lastBeat = null;
  say({ event: 'mode', mode });
  status();
}

say({ event: 'hello', emulated: true, real_transport: false, lost_message: 'Lost contact with the robot.' });

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const command = JSON.parse(line);

  if (LIVENESS.has(command.cmd)) beat();
  else if (command.cmd === 'enter') enter(command.mode);
});

process.stdin.on('end', () => process.exit(0));
