import { checkedDsn } from '../../src/wiring/boardDsn.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkedBoardRequest } from './inputs.mjs';
import { boardProcess, boardExecutable } from './process.mjs';
import { nativeRouteCandidate } from './routeCandidate.mjs';
import { routeMemory } from './routeMemory.mjs';
import { watchRouteFiles } from './routeFiles.mjs';
import { routeTools, verifyRoutingRuntime, ROUTER_HASH, ROUTER_VERSION, ROUTER_JAVA_VERSION } from './routeTools.mjs';
import { checkedRoutePlan, routeStackup, checkedSession } from '../../src/wiring/boardRouteContract.mjs';
import { readKiCadBoard, kiCadChild, kiCadChildren, kiCadNumber } from '../../src/wiring/boardKiCad.mjs';
import { boardDigest } from '../../src/wiring/boardNativeContract.mjs';
import { reconcileRoutedBoard } from '../../src/wiring/boardReconcile.mjs';

export function boundedRouteRequest(input) {
  if (!input || typeof input !== 'object' || Object.keys(input).some((key) => !['request', 'plan'].includes(key)))
    throw new Error('board-format');

  checkedRoutePlan(input.plan, input.request?.rules);
}

async function routeInput(input) {
  boundedRouteRequest(input);
  await checkedBoardRequest(input.request);

  const { request, plan } = input;
  const board = readKiCadBoard(request.pcb);

  if (kiCadChildren(board, 'segment').length || kiCadChildren(board, 'via').length)
    throw new Error('board-route-copper');

  if (request.pcb !== request.expected) throw new Error('board-source');

  if (!hasCarrierConnections(board)) throw new Error('board-route-layout');

  if (request.mechanicalIssues.length) throw new Error('board-route-layout');

  if (kiCadChildren(kiCadChild(board, 'setup'), 'stackup').length) throw new Error('board-route-requirements');

  const thickness = kiCadNumber(kiCadChild(kiCadChild(board, 'general'), 'thickness')[1]);
  const stackup = routeStackup(plan, thickness);

  return request.pcb.replace('(setup', `(setup ${stackup}`);
}

export async function routeNativeBoard(input, options = {}) {
  options.signal?.throwIfAborted();

  const pcb = await routeInput(input);
  const tools = await (options.tools ?? routeTools)();
  const directory = await fs.mkdtemp(path.join(options.temporaryRoot ?? os.tmpdir(), 'basecase-route-'));
  const metrics = { routeMs: 0, outputBytes: 0, peakRssBytes: 0 };
  const abort = new AbortController();
  const cancel = () => abort.abort();
  const limit = (cause) => abort.abort(new Error('board-route-limit', { cause }));
  const timer = setTimeout(limit, 40_000);
  const start = performance.now();
  const stopWatching = watchRouteFiles(directory, limit);
  const run = options.execute ?? boardProcess;
  const execute = (command, args) =>
    run({
      command,
      args,
      cwd: directory,
      signal: abort.signal,
      observe: routeMemory({ python: tools.python, cwd: directory, signal: abort.signal, metrics }),
    });

  options.signal?.addEventListener('abort', cancel, { once: true });

  try {
    options.signal?.throwIfAborted();
    await verifyRoutingRuntime(tools, { cwd: directory, signal: abort.signal });
    await fs.writeFile(path.join(directory, 'robot.kicad_pcb'), pcb);
    await fs.writeFile(
      path.join(directory, 'routing.json'),
      JSON.stringify({ ...input.plan, exclusions: input.request.copperExclusions ?? [] }),
    );

    const converter = fileURLToPath(new URL('./routeConvert.py', import.meta.url));

    await execute(tools.python, [converter, 'dsn']);

    const dsn = checkedDsn(await routeOutput(directory, 'robot.dsn'));

    await execute(tools.java, routerArguments(tools, directory));

    const ses = checkedSession(await routeOutput(directory, 'robot.ses'));

    await execute(tools.python, [converter, 'ses']);

    const candidate = await nativeRouteCandidate({
      request: input.request,
      pcb: await routeOutput(directory, 'candidate.kicad_pcb'),
      signal: abort.signal,
      temporaryRoot: path.dirname(directory),
      cli: validationCli(options, tools, metrics),
      normalize: async (ids) => {
        await fs.writeFile(path.join(directory, 'cleanup.json'), JSON.stringify(ids));
        await execute(tools.python, [converter, 'cleanup']);

        return routeOutput(directory, 'candidate.kicad_pcb');
      },
    });
    const compared = reconcileRoutedBoard({
      expected: input.request.expected,
      imported: candidate,
      sourceFingerprint: input.request.sourceFingerprint,
    });

    if (!compared.accepted) throw new Error(compared.code);

    checkRoutedDimensions(candidate, input.plan);

    options.signal?.throwIfAborted();
    abort.signal.throwIfAborted();
    metrics.routeMs = performance.now() - start;
    metrics.outputBytes = Buffer.byteLength(candidate) + Buffer.byteLength(ses);

    return {
      pcb: candidate,
      metrics,
      provenance: {
        engine: 'freerouting',
        version: ROUTER_VERSION,
        artifactHash: ROUTER_HASH,
        runtime: ROUTER_JAVA_VERSION,
        dsnHash: await boardDigest(dsn),
        sesHash: await boardDigest(ses),
      },
    };
  } catch (error) {
    options.signal?.throwIfAborted();
    abort.signal.throwIfAborted();

    throw routingError(error);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    await stopWatching();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function routingError(error) {
  if (error instanceof Error && error.message.startsWith('board-') && error.message !== 'board-validation')
    return error;

  return new Error('board-route-failed', { cause: error });
}

function routerArguments(tools, directory) {
  return [
    '-Xmx256m',
    '-XX:MaxMetaspaceSize=128m',
    '-XX:ReservedCodeCacheSize=64m',
    '-XX:MaxDirectMemorySize=64m',
    '-XX:ActiveProcessorCount=2',
    '-Xss512k',
    `-Djava.io.tmpdir=${directory}`,
    '-Djava.awt.headless=true',
    '-Dhttp.proxyHost=127.0.0.1',
    '-Dhttp.proxyPort=9',
    '-Dhttps.proxyHost=127.0.0.1',
    '-Dhttps.proxyPort=9',
    '-jar',
    tools.jar,
    '-da',
    '--gui.enabled=false',
    '--api_server.enabled=false',
    '--router.stop_pass_no=8',
    '--router.vias_allowed=true',
    '--router.scoring.via_costs=1',
    `--user_data_path=${path.join(directory, 'settings')}`,
    '-de',
    'robot.dsn',
    '-do',
    'robot.ses',
    '-mp',
    '8',
    '-mt',
    '0',
  ];
}

async function routeOutput(directory, name) {
  const file = path.join(directory, name);
  const stat = await fs.lstat(file);

  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('board-route-limit');

  return new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(file));
}

function checkRoutedDimensions(candidate, plan) {
  const board = readKiCadBoard(candidate);
  const differs = (object, key, expected) => Math.abs(kiCadNumber(kiCadChild(object, key)[1]) - expected) > 0.000001;
  const tracks = kiCadChildren(board, 'segment');
  const vias = kiCadChildren(board, 'via');

  if (
    tracks.some((track) => differs(track, 'width', plan.trackWidthMm)) ||
    vias.some((via) => differs(via, 'size', plan.viaDiameterMm) || differs(via, 'drill', plan.viaDrillMm))
  )
    throw new Error('board-route-requirements');
}

function hasCarrierConnections(board) {
  const counts = new Map();
  const pads = kiCadChildren(board, 'footprint').flatMap((footprint) => kiCadChildren(footprint, 'pad'));

  for (const pad of pads.filter((candidate) => candidate[2] === 'thru_hole')) {
    const net = kiCadChildren(pad, 'net')[0];

    if (!net || net[1] === '0' || String(net[2]).startsWith('unconnected-(')) continue;

    counts.set(net[2], (counts.get(net[2]) ?? 0) + 1);
  }

  return [...counts.values()].some((count) => count > 1);
}

function validationCli(options, tools, metrics) {
  if (options.cli) return options.cli;

  return async (args, cwd, signal) =>
    boardProcess({
      command: await boardExecutable(),
      args,
      cwd,
      signal,
      observe: routeMemory({ python: tools.python, cwd, signal, metrics }),
    });
}
