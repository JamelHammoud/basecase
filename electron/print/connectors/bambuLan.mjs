import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { bambuStatus, mergeReport } from './bambuStatus.mjs';
import { uploadFile } from './ftps.mjs';
import { connectMqtt } from './mqtt.mjs';
import {
  ACCESS_CODE_MESSAGE,
  displayName,
  statusOrOffline,
  testResult,
  unreachableMessage,
  uploadResult,
} from './shared.mjs';

const USER = 'bblp';
const REPORT_WAIT_MS = 4000;

const FTP_MESSAGES = {
  auth: ACCESS_CODE_MESSAGE,
  storage: 'The printer couldn’t save the file. Check its SD card is in and has space.',
  protocol: 'The upload to the printer stopped. Try again.',
};

export function jobTitle(name) {
  return String(name).replace(/(\.gcode)?\.(3mf|gcode)$/i, '');
}

export function projectFileCommand({ name, plate = 1, useAms, amsMapping }) {
  return {
    command: 'project_file',
    param: `Metadata/plate_${plate}.gcode`,
    url: `ftp:///${name}`,
    subtask_name: jobTitle(name),
    md5: '',
    bed_type: 'auto',
    timelapse: false,
    bed_leveling: true,
    flow_cali: false,
    vibration_cali: true,
    layer_inspect: false,
    use_ams: Boolean(useAms),
    ams_mapping: Array.isArray(amsMapping) ? amsMapping : [],
    project_id: '0',
    profile_id: '0',
    task_id: '0',
    subtask_id: '0',
  };
}

function mqttMessage(error, host) {
  if (error.returnCode === 4 || error.returnCode === 5) return ACCESS_CODE_MESSAGE;

  if (error.reason === 'refused') {
    return 'The printer refused the connection. Turn on LAN Only and Developer Mode on the printer, then try again.';
  }

  return unreachableMessage(host);
}

function noReportMessage(serial) {
  return `The printer didn’t answer as ${serial}. Check the serial number on the printer: Settings → Device.`;
}

function parseReport(payload) {
  try {
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return undefined;
  }
}

class BambuLanConnector {
  kind = 'bambu-lan';
  canStatus = true;
  canStart = true;

  constructor(printer, secret, { mqttPort = 8883, ftpsPort = 990, reportWaitMs = REPORT_WAIT_MS } = {}) {
    this.printer = printer;
    this.host = printer.connection?.host;
    this.serial = printer.connection?.serial;
    this.secret = secret;
    this.ports = { mqtt: mqttPort, ftps: ftpsPort };
    this.reportWaitMs = reportWaitMs;
    this.print = {};
    this.reported = false;
    this.sequence = 0;
    this.connecting = null;
    this.generation = 0;
    this.events = new EventEmitter();
  }

  requireSetup() {
    if (!this.host) throw new Error('Add the printer’s IP address. It’s on the printer: Settings → Network.');

    if (!this.serial) throw new Error('Add the printer’s serial number. It’s on the printer: Settings → Device.');

    if (!this.secret) throw new Error('Add the printer’s access code. It’s on the printer: Settings → LAN Only.');
  }

  connect() {
    this.requireSetup();

    const generation = this.generation;

    this.connecting ??= connectMqtt({
      host: this.host,
      port: this.ports.mqtt,
      clientId: `basecase-${randomBytes(6).toString('hex')}`,
      username: USER,
      password: this.secret,
    }).then(
      (client) => this.attach(client, generation),
      (error) => {
        this.connecting = null;

        throw new Error(mqttMessage(error, this.host), { cause: error });
      },
    );

    return this.connecting;
  }

  attach(client, generation) {
    if (generation !== this.generation) {
      client.close();

      throw new Error('The printer connection was closed.');
    }

    client.on('message', (_topic, payload) => this.receive(payload));
    client.on('close', () => this.detach(client));
    client.subscribe(`device/${this.serial}/report`);
    client.publish(this.requestTopic(), JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
    this.client = client;

    return client;
  }

  detach(client) {
    if (this.client !== client) return;

    this.client = null;
    this.connecting = null;
    this.reported = false;
  }

  requestTopic() {
    return `device/${this.serial}/request`;
  }

  receive(payload) {
    const report = parseReport(payload);

    if (!report?.print) return;

    this.print = mergeReport(this.print, report.print);
    this.reported = true;
    this.events.emit('report');
  }

  waitForReport() {
    if (this.reported) return Promise.resolve(true);

    return new Promise((resolve) => {
      const done = (value) => {
        clearTimeout(timer);
        this.events.off('report', onReport);
        resolve(value);
      };
      const onReport = () => done(true);
      const timer = setTimeout(() => done(false), this.reportWaitMs);

      this.events.on('report', onReport);
    });
  }

  async connectAndListen() {
    await this.connect();

    if (!(await this.waitForReport())) throw new Error(noReportMessage(this.serial));
  }

  async command(print) {
    const client = await this.connect();

    this.sequence += 1;
    client.publish(this.requestTopic(), JSON.stringify({ print: { sequence_id: String(this.sequence), ...print } }));
  }

  test() {
    return testResult(async () => {
      await this.connectAndListen();

      return `Connected to ${displayName(this.printer, 'Bambu Lab printer')}`;
    });
  }

  status() {
    return statusOrOffline(async () => {
      await this.connectAndListen();

      return bambuStatus(this.print);
    });
  }

  async upload(file, name) {
    try {
      await fs.promises.access(file, fs.constants.R_OK);
    } catch {
      throw new Error(`Couldn’t read ${path.basename(String(file))}. Slice the plate again.`);
    }

    try {
      await uploadFile({
        host: this.host,
        port: this.ports.ftps,
        user: USER,
        password: this.secret,
        file,
        remotePath: `/${name}`,
      });
    } catch (error) {
      throw new Error(FTP_MESSAGES[error.reason] ?? unreachableMessage(this.host), { cause: error });
    }
  }

  async send({ file, name, plate = 1, start, useAms, amsMapping }) {
    this.requireSetup();
    await this.upload(file, name);

    if (!start) return uploadResult(name, false);

    await this.command(projectFileCommand({ name, plate, useAms, amsMapping }));

    return uploadResult(name, true);
  }

  pause() {
    return this.command({ command: 'pause' });
  }

  resume() {
    return this.command({ command: 'resume' });
  }

  cancel() {
    return this.command({ command: 'stop' });
  }

  close() {
    const client = this.client;

    this.generation += 1;
    this.connecting = null;
    this.client = null;
    this.reported = false;
    client?.close();
  }
}

export function createBambuLan(printer, secret, options) {
  return new BambuLanConnector(printer, secret, options);
}
