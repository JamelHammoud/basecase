import net from 'node:net';
import readline from 'node:readline';
import { expect, it } from 'vitest';
import { fakeNetworkRobot, TEST_KEY } from './networkFake.mjs';
import { authenticationProof, signedCommand } from './networkSocket.mjs';

it('answers authenticated heartbeats and intents with the current mode', async () => {
  const robot = await fakeNetworkRobot();
  const socket = net.createConnection({ host: robot.endpoint.host, port: robot.endpoint.port });
  const reader = readline.createInterface({ input: socket });
  const lines = reader[Symbol.asyncIterator]();
  const receive = async () => JSON.parse((await lines.next()).value);
  const send = (command) => socket.write(`${JSON.stringify(command)}\n`);

  try {
    const { nonce } = await receive();

    send({ cmd: 'authenticate', proof: authenticationProof(TEST_KEY, nonce) });
    expect(JSON.parse((await receive()).body).event).toBe('hello');
    expect(JSON.parse((await receive()).body)).toMatchObject({ event: 'status', mode: 'look' });
    send(signedCommand(TEST_KEY, nonce, 1, { cmd: 'enter', mode: 'test' }));
    expect(JSON.parse((await receive()).body)).toEqual({ event: 'mode', mode: 'test' });
    send(signedCommand(TEST_KEY, nonce, 2, { cmd: 'heartbeat' }));
    expect(JSON.parse((await receive()).body)).toMatchObject({ event: 'status', mode: 'test' });
    send(signedCommand(TEST_KEY, nonce, 3, { cmd: 'intent', joints: [0.1, 0.2] }));
    expect(JSON.parse((await receive()).body)).toMatchObject({ event: 'status', mode: 'test' });
    expect(robot.commands).toEqual([
      { cmd: 'enter', mode: 'test' },
      { cmd: 'heartbeat' },
      { cmd: 'intent', joints: [0.1, 0.2] },
    ]);
  } finally {
    reader.close();
    socket.destroy();
    await robot.close();
  }
});
