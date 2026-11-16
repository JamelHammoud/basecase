import fs from 'node:fs';
import path from 'node:path';
import { downloadSnapshots } from './snapshots.mjs';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { checkedComputer, runSsh, sshArguments } from './config.mjs';
import { linuxBundle, sha256 } from './bundle.mjs';
import { ARTIFACT_BYTES, dispatchScript, inputManifest, pollScript, remoteDirectory, stopScript } from './scripts.mjs';

const INPUTS = ['model.xml', 'job.json', 'demos.json', 'warm-policy.json', 'warm/policy.json', 'warm/resume.json'];
const MAX_INPUT_BYTES = 192 * 1024 * 1024;
const ID = /^policy-[a-z0-9-]{1,100}$/;
const CONFIG = 'computer';

function atomic(file, bytes) {
  fs.writeFileSync(`${file}.partial`, bytes, { mode: 0o600 });
  fs.renameSync(`${file}.partial`, file);
}

function inputFiles(dir, names = INPUTS) {
  const files = {};
  let total = 0;

  for (const name of names) {
    const file = path.join(dir, name);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });

    if (!stat) continue;

    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error('The training input file is unsupported.');

    total += stat.size;

    if (total > MAX_INPUT_BYTES) throw new Error('The training inputs exceed 192 MB.');

    files[name] = fs.readFileSync(file);
  }

  return files;
}

function decodedFile(file) {
  if (!file || typeof file.data !== 'string' || file.data.length > Math.ceil(ARTIFACT_BYTES / 3) * 4)
    throw new Error('The remote training artifact exceeds 64 MB.');

  const bytes = Buffer.from(file.data, 'base64');

  if (bytes.length > ARTIFACT_BYTES || bytes.toString('base64') !== file.data || sha256(bytes) !== file.hash)
    throw new Error('The remote training artifact failed verification.');

  JSON.parse(bytes.toString('utf8'));

  return bytes;
}

function readEvents(log) {
  if (typeof log !== 'string' || log.length > 1_398_104) throw new Error('The remote training log exceeds 1 MB.');

  return Buffer.from(log, 'base64')
    .toString('utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);

        return event && typeof event === 'object' && !Array.isArray(event) ? [event] : [];
      } catch {
        return [];
      }
    });
}

export class RemoteTraining {
  constructor({ libraryDir, secrets, run = runSsh, bundle = linuxBundle }) {
    this.libraryDir = libraryDir;
    this.secrets = secrets;
    this.run = run;
    this.bundle = bundle;
    this.keys = new AgentKeys({ dir: libraryDir, secrets, file: 'training-computer.json' });
    this.bundlePromise = null;
  }

  configuration() {
    try {
      return JSON.parse(this.keys.get(CONFIG) ?? 'null');
    } catch {
      return null;
    }
  }

  selected() {
    return this.configuration()?.selected === true;
  }

  available() {
    return !!this.secrets?.available();
  }

  status() {
    const saved = this.configuration();

    if (!saved) return { selected: false, keySaved: false };

    const { host, user, hostKey } = saved.computer;

    return { selected: saved.selected, host, user, hostKey, keySaved: true };
  }

  async configure(request) {
    if (!this.secrets?.available()) throw new Error('Secure storage is unavailable. Reopen the studio to connect.');

    const saved = this.configuration()?.computer;
    const reuse =
      saved && saved.host === request?.host && saved.user === request?.user && saved.hostKey === request?.hostKey;
    const computer = checkedComputer({ ...request, key: request?.key || (reuse ? saved.key : '') });
    const machine = await this.execute(computer, 'set -eu\nuname -sm\n');

    if (machine.trim() !== 'Linux x86_64') throw new Error('Choose an x64 Linux training computer.');

    this.keys.set(CONFIG, JSON.stringify({ selected: true, computer }));

    return this.status();
  }

  clear() {
    const saved = this.configuration();

    if (saved) this.keys.set(CONFIG, JSON.stringify({ ...saved, selected: false }));

    return this.status();
  }

  async execute(computer, input, maxBytes) {
    const checked = checkedComputer(computer);
    const dir = path.join(this.libraryDir, 'training-ssh');
    const knownHosts = path.join(dir, `${sha256(Buffer.from(`${checked.host} ${checked.hostKey}`))}.known-hosts`);

    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    atomic(knownHosts, `${checked.host} ${checked.hostKey}\n`);

    return this.run({ args: sshArguments(checked, knownHosts), input, maxBytes });
  }

  jobDirectory(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error('The remote training job id is malformed.');

    return path.join(this.libraryDir, 'training', id);
  }

  save(descriptor) {
    const dir = this.jobDirectory(descriptor.id);

    atomic(path.join(dir, 'remote.json'), JSON.stringify({ ...descriptor, dir: undefined }));
  }

  async prepare({ id, dir, workspaceId, fingerprint }) {
    if (dir !== this.jobDirectory(id) || typeof workspaceId !== 'string' || typeof fingerprint !== 'string')
      throw new Error('The remote training job identity is malformed.');

    const saved = this.configuration();

    if (!saved?.selected || !this.secrets?.available()) throw new Error('Choose a training computer in Settings.');

    this.bundlePromise ??= this.bundle().catch((error) => {
      this.bundlePromise = null;

      throw error;
    });

    const runtime = await this.bundlePromise;

    inputManifest(Object.fromEntries(Object.entries(runtime).map(([name, bytes]) => [name, sha256(bytes)])));

    for (const [name, bytes] of Object.entries(runtime)) atomic(path.join(dir, name), bytes);

    const files = { ...inputFiles(dir), ...runtime };
    const inputHashes = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha256(bytes)]));

    inputManifest(inputHashes);

    const descriptor = {
      id,
      dir,
      workspaceId,
      fingerprint,
      inputHashes,
      state: 'prepared',
      computer: this.secrets.encrypt(JSON.stringify(saved.computer)),
    };

    this.save(descriptor);

    return descriptor;
  }

  descriptors() {
    const jobsDir = path.join(this.libraryDir, 'training');

    if (!fs.existsSync(jobsDir)) return [];

    return fs
      .readdirSync(jobsDir)
      .filter((id) => ID.test(id))
      .flatMap((id) => {
        try {
          const descriptor = JSON.parse(fs.readFileSync(path.join(jobsDir, id, 'remote.json'), 'utf8'));

          if (descriptor.id !== id || descriptor.state === 'completed') return [];

          inputManifest(descriptor.inputHashes);

          return [{ ...descriptor, dir: this.jobDirectory(id) }];
        } catch {
          return [];
        }
      });
  }

  computer(descriptor) {
    remoteDirectory(descriptor.id);

    return checkedComputer(JSON.parse(this.secrets.decrypt(descriptor.computer)));
  }

  async dispatch(descriptor) {
    inputManifest(descriptor.inputHashes);

    const files = inputFiles(this.jobDirectory(descriptor.id), Object.keys(descriptor.inputHashes));

    if (Object.entries(descriptor.inputHashes).some(([name, hash]) => !files[name] || sha256(files[name]) !== hash))
      throw new Error('The frozen training inputs changed. Start training again.');

    await this.execute(this.computer(descriptor), dispatchScript(descriptor, files));
    descriptor.state = 'dispatched';
    this.save(descriptor);
  }

  async poll(descriptor) {
    const text = await this.execute(this.computer(descriptor), pollScript(descriptor), 184 * 1024 * 1024);
    const reply = JSON.parse(text);

    if (!['running', 'done', 'failed'].includes(reply.state) || !Number.isSafeInteger(reply.code))
      throw new Error('The remote training status is malformed.');

    const events = readEvents(reply.log);
    const stderr = events.length ? '' : Buffer.from(reply.log, 'base64').toString('utf8').slice(-8000);

    if (reply.state === 'done' && reply.code === 0) {
      const policy = decodedFile(reply['policy.json']);
      const resume = decodedFile(reply['resume.json']);
      const dir = this.jobDirectory(descriptor.id);

      atomic(path.join(dir, 'policy.json'), policy);
      atomic(path.join(dir, 'resume.json'), resume);
    }

    await downloadSnapshots({
      descriptor,
      events,
      execute: (...args) => this.execute(...args),
      computer: this.computer(descriptor),
    });

    return { state: reply.code ? 'failed' : reply.state, code: reply.code, events, stderr };
  }

  stop(descriptor) {
    return this.execute(this.computer(descriptor), stopScript(descriptor));
  }

  markCompleted(descriptor) {
    descriptor.state = 'completed';
    this.save(descriptor);
  }
}
