import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkedBoardRequest, nativeProject } from './inputs.mjs';
import { boardExecutable, boardProcess } from './process.mjs';
import { checkedOutput, fabricationOutputs, reproducibleNativeText, watchBoardOutputs } from './outputs.mjs';
import {
  boardEvidenceKey,
  BOARD_CLI_VERSION,
  completeBoardRules,
  explicitBoardStackup,
} from '../../src/wiring/boardNativeContract.mjs';

export async function runNativeBoard(request, options = {}) {
  await checkedBoardRequest(request);

  const key = await boardEvidenceKey(request);
  const result = { key, version: null, issues: [], report: null, files: {}, metrics: { cliMs: 0, outputBytes: 0 } };
  const start = performance.now();
  const directory = await fs.mkdtemp(path.join(options.temporaryRoot ?? os.tmpdir(), 'basecase-pcb-'));
  const cli =
    options.cli ?? (async (args, cwd, signal) => boardProcess({ command: await boardExecutable(), args, cwd, signal }));
  const abort = new AbortController();
  const stop = () => abort.abort();
  const stopWatching = watchBoardOutputs(directory, abort);
  const timer = setTimeout(stop, 45_000);

  options.signal?.addEventListener('abort', stop, { once: true });

  const invoke = (args) => cli(args, directory, abort.signal);

  try {
    options.signal?.throwIfAborted();

    const version = await invoke(['version']);

    result.version = /^\d{1,3}\.\d{1,3}\.\d{1,3}[A-Za-z0-9.+_-]{0,24}$/u.test(version) ? version : null;

    if (result.version !== BOARD_CLI_VERSION) {
      result.issues.push('board-validator');

      return result;
    }

    await fs.mkdir(path.join(directory, 'Robot.pretty'));
    await fs.writeFile(
      path.join(directory, 'fp-lib-table'),
      '(fp_lib_table (version 7) (lib (name "Robot") (type "KiCad") (uri "${KIPRJMOD}/Robot.pretty") (options "") (descr "Robot board footprints")))',
    );
    await Promise.all(
      Object.entries(request.footprints).map(([name, text]) =>
        fs.writeFile(path.join(directory, 'Robot.pretty', name), text),
      ),
    );
    await Promise.all([
      fs.writeFile(path.join(directory, 'robot.kicad_pcb'), request.pcb),
      fs.writeFile(path.join(directory, 'robot.kicad_sch'), request.schematic),
      fs.writeFile(path.join(directory, 'robot.kicad_pro'), nativeProject(request.rules)),
    ]);
    await invoke([
      'pcb',
      'drc',
      'robot.kicad_pcb',
      '--schematic-parity',
      '--format',
      'json',
      '--severity-all',
      '--output',
      'drc.json',
    ]);

    const report = reproducibleNativeText(await checkedOutput(directory, 'drc.json'), directory);
    const checked = JSON.parse(report);

    result.report = report;

    result.issues = reportIssues(checked, request);

    if (result.issues.length) return result;

    await fs.mkdir(path.join(directory, 'fabrication'));
    await invoke([
      'pcb',
      'export',
      'gerbers',
      'robot.kicad_pcb',
      '--output',
      'fabrication',
      '--layers',
      'F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts',
      '--no-protel-ext',
      '--precision',
      '6',
    ]);
    await invoke([
      'pcb',
      'export',
      'drill',
      'robot.kicad_pcb',
      '--output',
      'fabrication',
      '--format',
      'excellon',
      '--drill-origin',
      'absolute',
      '--excellon-units',
      'mm',
      '--excellon-separate-th',
      '--excellon-zeros-format',
      'decimal',
    ]);

    const outputs = await fabricationOutputs(path.join(directory, 'fabrication'));

    result.files = outputs.files;
    result.metrics.outputBytes = outputs.bytes;
    options.signal?.throwIfAborted();

    return result;
  } catch (error) {
    options.signal?.throwIfAborted();
    result.issues = [error.message === 'board-validator' ? 'board-validator' : 'board-validation'];
    result.files = {};

    return result;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', stop);
    await stopWatching();
    await fs.rm(directory, { recursive: true, force: true });
    result.metrics.cliMs = performance.now() - start;
  }
}

function reportIssues(checked, request) {
  const result = { issues: [] };

  if (checked.kicad_version !== BOARD_CLI_VERSION) result.issues.push('board-validator');

  if (!Array.isArray(checked.violations) || checked.violations.length) result.issues.push('board-drc');

  if (!Array.isArray(checked.unconnected_items) || checked.unconnected_items.length)
    result.issues.push('board-unrouted');

  if (!Array.isArray(checked.schematic_parity) || checked.schematic_parity.length) result.issues.push('board-parity');

  if (!completeBoardRules(request.rules) || !explicitBoardStackup(request.pcb))
    result.issues.push('board-manufacturing');

  result.issues.push(...request.mechanicalIssues);
  result.issues = [...new Set(result.issues)].slice(0, 64);

  return result.issues;
}
