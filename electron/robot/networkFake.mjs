import { createHmac, randomBytes } from 'node:crypto';
import net from 'node:net';
import { authenticationProof, signedCommand } from './networkSocket.mjs';
import { robotId } from './networkIdentity.mjs';
import { checkedRobotSpec, emulatedCalibration } from './robotSpec.mjs';

export const TEST_KEY = 'ab'.repeat(32);

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };

export async function fakeNetworkRobot({ spec = ARM, greeting = {}, challenge = true } = {}) {
  const normalized = checkedRobotSpec(spec).spec;
  const sockets = new Set();
  const commands = [];
  const sessions = [];
  const server = net.createServer((socket) => {
    const nonce = randomBytes(32).toString('hex');
    let seq = 0;
    let incoming = 0;
    let partial = '';
    let mode = 'look';
    const send = (event) => {
      const body = JSON.stringify(event);
      const mac = createHmac('sha256', Buffer.from(TEST_KEY, 'hex'))
        .update(`${nonce}:server:${++seq}:${body}`)
        .digest('hex');
      const envelope = { seq, body, mac };

      socket.write(`${JSON.stringify(envelope)}\n`);

      return envelope;
    };
    const status = () =>
      send({
        event: 'status',
        mode,
        run: 'idle',
        joints: normalized.ids.map((id) => ({ id, position: 2048 })),
      });
    const session = { socket, send, raw: (event) => socket.write(`${JSON.stringify(event)}\n`) };

    sockets.add(socket);
    sessions.push(session);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});

    if (challenge) session.raw({ event: 'challenge', nonce, paired: true });

    const receive = (command) => {
      if (command.cmd === 'authenticate' && command.proof !== authenticationProof(TEST_KEY, nonce)) return socket.end();

      if (command.cmd === 'authenticate') {
        send({
          event: 'hello',
          id: robotId(TEST_KEY),
          family: spec.family,
          spec,
          calibration: emulatedCalibration(normalized),
          emulated: true,
          real_transport: false,
          lost_message: 'Lost contact with the robot.',
          ...greeting,
        });
        status();

        return;
      }

      const body = JSON.parse(command.body);
      const expected = signedCommand(TEST_KEY, nonce, ++incoming, body);

      if (command.seq !== expected.seq || command.mac !== expected.mac) return socket.destroy();

      commands.push(body);

      if (body.cmd === 'enter') {
        mode = body.mode;
        send({ event: 'mode', mode });
      }

      if (body.cmd === 'heartbeat' || body.cmd === 'intent') status();
    };

    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      const lines = `${partial}${chunk}`.split('\n');

      partial = lines.pop();

      for (const line of lines.filter(Boolean)) receive(JSON.parse(line));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    endpoint: { host: '127.0.0.1', port: server.address().port },
    commands,
    sessions,
    close: async () => {
      for (const socket of sockets) socket.destroy();

      await new Promise((resolve) => server.close(resolve));
    },
  };
}
