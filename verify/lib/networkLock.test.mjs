import { describe, expect, it } from 'vitest';
import { ROOT } from './gate.mjs';
import { networkSourceProblems, readNetworkSources } from './networkLock.mjs';

const CONTROL = 'hw/crates/robot-daemon/src/network/server.rs';
const CLI = 'hw/crates/robot-daemon/src/cli.rs';
const LOOPBACK = 'hw/crates/servo-emu/src/loopback.rs';
const FIXTURES = 'hw/crates/robot-daemon/tests/network_security.rs';
const INTERFACES = 'hw/crates/robot-daemon/src/network/interfaces.rs';
const sources = () => readNetworkSources(ROOT);
const change = (files, file, rewrite) =>
  files.map((entry) => (entry.file === file ? { ...entry, text: rewrite(entry.text) } : entry));

describe('the motor transport source lock with an opt-in control listener', () => {
  it('accepts the private listener while real motor transports remain isolated', () => {
    expect(networkSourceProblems(sources())).toEqual([]);
  });

  it.each([
    ['TcpListener::bind(options.address)', 'TcpListener::bind(other_address)'],
    ['if !private_address(options.address.ip())', 'if private_address(options.address.ip())'],
    ['if !private_address(options.address.ip())', 'if false'],
  ])('refuses a control listener changed from %s to %s', (from, to) => {
    const files = change(sources(), CONTROL, (text) => {
      expect(text).toContain(from);

      return text.replace(from, to);
    });

    expect(networkSourceProblems(files).length).toBeGreaterThan(0);
  });

  it.each([
    'rustdds::DdsTransport',
    'TcpListener::bind(other_address)',
    'UdpSocket::bind(other_address)',
    'UNSPECIFIED',
  ])('refuses extra network use in the control listener: %s', (fault) => {
    expect(networkSourceProblems(change(sources(), CONTROL, (text) => `${text}\n${fault}`)).length).toBeGreaterThan(0);
  });

  it('refuses a listener that starts without an explicit address', () => {
    const files = change(sources(), CLI, (text) =>
      text.replace('let network = listen.map(', 'let network = always_listen.map('),
    );

    expect(networkSourceProblems(files)).toContain(
      'The control listener must be enabled only by an explicit private address or selected interface.',
    );
  });

  it.each([
    ['let listen = interface.resolve(listen)?;', 'let listen = Some(default_address);'],
    ['"--listen-interface" => interface.name = Some(value()?),', '"--listen-interface" => ignore(value()?),'],
  ])('refuses an implicit interface listener replacing %s', (from, to) => {
    const files = change(sources(), CLI, (text) => {
      expect(text).toContain(from);

      return text.replace(from, to);
    });

    expect(networkSourceProblems(files).length).toBeGreaterThan(0);
  });

  it.each([
    ['return Ok(numeric);', 'return Ok(Some(default_address));'],
    ['address.name == name && ', ''],
    ['&& private_address(address.ip)', ''],
  ])('refuses an interface resolver changed from %s to %s', (from, to) => {
    const files = change(sources(), INTERFACES, (text) => {
      expect(text).toContain(from);

      return text.replace(from, to);
    });

    expect(networkSourceProblems(files).length).toBeGreaterThan(0);
  });

  it('refuses a second source module or a test fixture that opens a socket', () => {
    const fault = '\nTcpListener::bind(public_address)';

    expect(
      networkSourceProblems([...sources(), { file: 'hw/crates/robot-daemon/src/another.rs', text: fault }]).length,
    ).toBeGreaterThan(0);
    expect(networkSourceProblems(change(sources(), FIXTURES, (text) => text + fault)).length).toBeGreaterThan(0);
  });

  it('keeps the emulator restricted to loopback', () => {
    expect(
      networkSourceProblems(change(sources(), LOOPBACK, (text) => text.replaceAll('LOOPBACK', 'UNSPECIFIED'))),
    ).toContain('The emulator must bind only LOOPBACK.');
  });
});
