import fs from 'node:fs';
import path from 'node:path';

const CONTROL = 'hw/crates/robot-daemon/src/network/server.rs';
const ADDRESS_FIXTURES = new Map([
  ['hw/crates/robot-daemon/tests/network_security.rs', '"0.0.0.0"'],
  ['hw/crates/robot-daemon/tests/binary_network.rs', '"0.0.0.0:7447"'],
]);
const LOOPBACK = 'hw/crates/servo-emu/src/loopback.rs';
const CLI = 'hw/crates/robot-daemon/src/cli.rs';
const MAIN = 'hw/crates/robot-daemon/src/main.rs';
const NETWORK = /rustdds::|::bind\(|0\.0\.0\.0|UNSPECIFIED/;
const CONTROL_BIND = 'TcpListener::bind(options.address)';
const compact = (source) => source.replace(/\s+/g, ' ');

function controlProblem(source) {
  const beforeBind = compact(source.slice(0, source.indexOf(CONTROL_BIND)));
  const privateGuard = /if !private_address\(options\.address\.ip\(\)\) \{ return Err\([^}]+\); \}/;

  if (!source.includes(CONTROL_BIND) || !privateGuard.test(beforeBind))
    return 'The control listener must refuse non-private addresses before binding.';

  return NETWORK.test(source.replace(CONTROL_BIND, '')) ? 'The control listener contains another network bind.' : null;
}

function sourceProblem({ file, text }) {
  if (file.startsWith('hw/crates/transport-real/')) return null;

  if (file === CONTROL) return controlProblem(text);

  if (file === LOOPBACK) {
    const binds = [...text.matchAll(/::bind\(([^)]*)\)/g)].map((match) => match[1]);
    const remainder = text.replace(/::bind\([^)]*\)/g, '');

    return !binds.length || binds.some((bind) => !bind.includes('LOOPBACK')) || NETWORK.test(remainder)
      ? 'The emulator must bind only LOOPBACK.'
      : null;
  }

  const fixture = ADDRESS_FIXTURES.get(file);
  const checked = fixture ? text.replaceAll(fixture, '') : text;

  return NETWORK.test(checked)
    ? `Network use outside the private control listener and loopback emulator: ${file}`
    : null;
}

function optInProblem(sources) {
  const cli = compact(sources.find(({ file }) => file === CLI)?.text ?? '');
  const main = compact(sources.find(({ file }) => file === MAIN)?.text ?? '');
  const explicit =
    cli.includes('let mut listen: Option<SocketAddr> = None;') &&
    /"--listen" => \{ listen = Some\(/.test(cli) &&
    cli.includes('let network = listen.map(');
  const dispatch = /if let Some\(options\) = network \{ robot_daemon::network::server::serve\(/.test(main);

  return explicit && dispatch ? null : 'The control listener must be enabled only by an explicit --listen address.';
}

export function networkSourceProblems(sources) {
  const problems = sources.map(sourceProblem).filter(Boolean);
  const optIn = optInProblem(sources);

  if (optIn) problems.push(optIn);

  if (!sources.some(({ file }) => file === CONTROL)) problems.push('The private control listener source is missing.');

  if (!sources.some(({ file }) => file === LOOPBACK)) problems.push('The loopback emulator source is missing.');

  return problems;
}

function rustFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);

    if (entry.isDirectory()) return rustFiles(file);

    return entry.isFile() && entry.name.endsWith('.rs') ? [file] : [];
  });
}

export function readNetworkSources(root) {
  return rustFiles(path.join(root, 'hw', 'crates')).map((file) => ({
    file: path.relative(root, file).split(path.sep).join('/'),
    text: fs.readFileSync(file, 'utf8'),
  }));
}
