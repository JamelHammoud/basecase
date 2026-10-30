import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentKeys } from '../backend/agentKeys.mjs';
import { connectorFor, discoverPrinters } from './connectors/index.mjs';
import { jobDir, openJob, openWith, readJson, slicedPlate, sliceJob, writeJob } from './jobs.mjs';
import { PrinterStore } from './printers.mjs';
import { extractPlateGcode } from './slice.mjs';
import { detectSlicers, DOWNLOAD_PAGES, findSlicerApp } from './slicers.mjs';

const BAMBU_CONNECT = ['/Applications/Bambu Connect.app', path.join(os.homedir(), 'Applications', 'Bambu Connect.app')];
const throughStudio = (printer) => !printer.connection || printer.connection.kind === 'bambu-studio';

export class Printing {
  constructor({ libraryDir, emit, secrets }) {
    this.dir = path.join(libraryDir, 'prints');
    this.emit = emit;
    this.printers = new PrinterStore(
      libraryDir,
      new AgentKeys({ dir: path.join(libraryDir, 'agent-config'), secrets, file: 'printer-keys.json' }),
    );
    this.running = new Map();
    this.connections = new Map();
  }

  status() {
    return {
      slicers: detectSlicers().map(({ kind, name, version }) => ({ kind, name, version })),
      downloads: DOWNLOAD_PAGES,
      bambuConnect: BAMBU_CONNECT.some((p) => fs.existsSync(p)),
    };
  }

  open(payload) {
    return openJob(writeJob(this.dir, payload), payload);
  }

  async slice(payload) {
    const written = writeJob(this.dir, payload);

    this.running.get(payload.jobId)?.abort();

    const controller = new AbortController();
    const progress = (message) => this.emit({ type: 'print-progress', jobId: payload.jobId, message });

    this.running.set(payload.jobId, controller);

    try {
      return await sliceJob(written, { signal: controller.signal, progress, wanted: payload.slicer });
    } finally {
      if (this.running.get(payload.jobId) === controller) this.running.delete(payload.jobId);
    }
  }

  lastSlice(jobId) {
    return readJson(path.join(jobDir(this.dir, jobId), 'slice.json'));
  }

  stopSlice(jobId) {
    const run = this.running.get(jobId);

    run?.abort();

    return { stopping: !!run };
  }

  connection(printer) {
    const secret = this.printers.secret(printer.id);
    const key = JSON.stringify([printer.connection, !!secret]);
    const cached = this.connections.get(printer.id);

    if (cached?.key === key) return cached.connector;

    cached?.connector.close();

    const connector = connectorFor(printer, secret);

    this.connections.set(printer.id, { key, connector });

    return connector;
  }

  printerOrThrow(id) {
    const printer = this.printers.get(id);

    if (!printer) throw new Error('Add the printer in Settings → Printers first.');

    return printer;
  }

  async send({ jobId, plate, printerId, start = true, useAms = true, amsMapping }) {
    const dir = jobDir(this.dir, jobId);
    const job = readJson(path.join(dir, 'job.json'));
    const { file, local } = slicedPlate(dir, plate);
    const printer = this.printerOrThrow(printerId);

    if (throughStudio(printer)) {
      const app = findSlicerApp('bambu');

      await openWith(app ? ['-a', app.path, file] : [file]);

      return { started: false, message: `Opened plate ${plate} in ${app ? 'Bambu Studio' : 'the slicer'}` };
    }

    const kind = printer.connection.kind;
    const name = `${job?.stem ?? 'robot'}-plate-${plate}`;
    const bambu = kind.startsWith('bambu');
    const upload = bambu ? file : extractPlateGcode(file, local, path.join(dir, `${name}.gcode`));

    return this.connection(printer).send({
      file: upload,
      name: bambu ? `${name}.gcode.3mf` : `${name}.gcode`,
      plate: bambu ? local : 1,
      start,
      useAms,
      amsMapping,
    });
  }

  listPrinters() {
    return this.printers.list();
  }

  savePrinters(list) {
    return this.printers.save(list);
  }

  setPrinterSecret({ id, secret }) {
    this.connections.get(id)?.connector.close();
    this.connections.delete(id);

    return this.printers.setSecret(id, secret);
  }

  discover() {
    return discoverPrinters({ timeoutMs: 4000 });
  }

  testPrinter(id) {
    const printer = this.printerOrThrow(id);

    if (!throughStudio(printer)) return this.connection(printer).test();

    const app = findSlicerApp('bambu');

    return { ok: !!app, message: app ? 'Sends through Bambu Studio' : 'Install Bambu Studio to send prints' };
  }

  async printerStatus(id) {
    const printer = this.printerOrThrow(id);

    if (throughStudio(printer)) return null;

    const connector = this.connection(printer);

    return connector.canStatus ? connector.status() : null;
  }

  async controlPrinter({ id, action }) {
    if (!['pause', 'resume', 'cancel'].includes(action)) throw new Error('Unknown printer action.');

    await this.connection(this.printerOrThrow(id))[action]();

    return { ok: true };
  }

  async reveal(jobId) {
    await openWith([jobDir(this.dir, jobId)]);

    return true;
  }

  openLink(url) {
    if (!Object.values(DOWNLOAD_PAGES).includes(url)) return false;

    return openWith([url]).then(() => true);
  }

  dispose() {
    for (const run of this.running.values()) run.abort();

    for (const { connector } of this.connections.values()) connector.close();
  }
}
