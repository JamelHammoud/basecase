import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import readline from 'node:readline';
import { NetworkRobotLink } from './networkRobotLink.mjs';
import { NetworkCredentials } from './networkCredentials.mjs';
import { emulatedCalibration } from './robotSpec.mjs';

export async function checkBodyLoopback(binary, directory) {
  const artefacts = path.join(directory, 'loopback');
  const spec = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };

  fs.mkdirSync(artefacts);
  fs.writeFileSync(path.join(artefacts, 'calibration.json'), JSON.stringify(emulatedCalibration(spec)));

  const child = spawn(
    binary,
    [
      '--family',
      'feetech',
      '--ids',
      '1,2',
      '--class',
      'arm',
      '--emulated',
      '--listen',
      '127.0.0.1:0',
      '--name',
      'Body loopback',
      '--artefacts',
      artefacts,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  const lines = readline.createInterface({ input: child.stdout });
  const events = [];
  const link = new NetworkRobotLink({
    binary,
    tmpDir: directory,
    credentials: new NetworkCredentials(),
    emit: (event) => events.push(event),
  });
  let diagnostics = '';

  child.stderr.on('data', (chunk) => {
    diagnostics += chunk;
  });

  try {
    const listening = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Loopback listener missing: ${diagnostics}`)), 5000);

      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error(diagnostics));
      });
      lines.on('line', (line) => {
        const event = JSON.parse(line);

        if (event.event !== 'listening') return;

        clearTimeout(timer);
        resolve(event);
      });
    });
    const endpoint = { host: '127.0.0.1', port: Number(listening.address.split(':').at(-1)) };
    const pairing = JSON.parse(fs.readFileSync(path.join(artefacts, 'pairing.json'), 'utf8'));

    link.credentials.save(endpoint, pairing.key);
    assert.equal((await link.connect(endpoint)).ok, true);
    assert.equal(link.state().hello.emulated, true);
    assert.equal(link.command({ cmd: 'claim_control', control: link.state().control, seconds: 2 }).ok, false);
    assert.equal(link.controlFor(link.session).held, false);
    assert.equal(
      events.some((event) => event.event === 'recorded' && event.manifest?.bodyMotion),
      false,
    );

    return { evidence: 'native-authenticated-tcp-loopback', execution: 'refused-network-backend' };
  } finally {
    link.dispose();
    lines.close();

    const closed = once(child, 'close');

    child.kill();
    await closed;
  }
}
