import assert from 'node:assert/strict';
import { boardDigest } from '../../src/wiring/boardNativeContract.mjs';
import { runNativeBoard } from '../../electron/electrical/validate.mjs';
import { routeNativeBoard } from '../../electron/electrical/route.mjs';
import { routingExecute, nativeElectricalCli } from './routingExecute.mjs';

const wholeBoard = { min: [-100, -100], max: [100, 100] };
const copper = /\t?\((?:segment|via)\s[\s\S]*?\n\t\)/gu;

export function routingFaultCases(request) {
  return [
    { name: 'unconnected', pcb: request.pcb.replace(copper, ''), issue: 'board-unrouted' },
    padFault(request, 'short', 3.5, 'shorting_items'),
    padFault(request, 'clearance', 3.1, 'clearance'),
    {
      name: 'track-width',
      pcb: request.pcb.replace(/\(width 0\.25\)/gu, '(width 0.01)'),
      issue: 'board-drc',
      type: 'track_width',
    },
    { name: 'forbidden-copper', pcb: request.pcb, issue: 'board-copper-exclusion', copperExclusions: [wholeBoard] },
  ];
}

export async function routingFaults({ request, input }) {
  const original = structuredClone(request);
  const results = [];

  for (const fault of routingFaultCases(request)) {
    const candidate = {
      ...request,
      pcb: fault.pcb,
      expected: fault.expected ?? request.expected,
      boardHash: await boardDigest(fault.pcb),
      copperExclusions: fault.copperExclusions ?? request.copperExclusions,
    };
    const result = await runNativeBoard(candidate, { cli: nativeElectricalCli });

    assert.ok(result.issues.includes(fault.issue), `${fault.name}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.files, {});

    const types = JSON.parse(result.report).violations.map((violation) => violation.type);

    if (fault.type) assert.ok(types.includes(fault.type), `${fault.name}: ${types.join(',')}`);

    results.push({ name: fault.name, issues: result.issues, types });
  }

  results.push(await impossibleRoute(input));
  assert.deepEqual(request, original);

  return results;
}

function padFault(request, name, diameter, type) {
  const pcb = resizePad(request.pcb, diameter);

  return {
    name,
    pcb,
    expected: pcb,
    issue: 'board-drc',
    type,
  };
}

function resizePad(pcb, diameter) {
  const padSize = /\(size\s+1\.7\s+1\.7\)/u;

  assert.match(pcb, padSize, 'Routing fault controls require the JST header pad geometry.');

  return pcb.replace(padSize, `(size ${diameter} ${diameter})`);
}

async function impossibleRoute(input) {
  const request = { ...input.request, copperExclusions: [wholeBoard] };
  let candidate;

  try {
    candidate = await routeNativeBoard({ ...input, request }, { execute: routingExecute, cli: nativeElectricalCli });
  } catch (error) {
    assert.ok(
      ['board-route-failed', 'board-route-limit', 'board-format', 'board-unrouted', 'board-copper-exclusion'].includes(
        error.message,
      ),
      error.stack,
    );

    return { name: 'impossible', issues: [error.message] };
  }

  const validation = await runNativeBoard(
    { ...request, pcb: candidate.pcb, boardHash: await boardDigest(candidate.pcb) },
    { cli: nativeElectricalCli },
  );

  assert.ok(validation.issues.some((code) => ['board-unrouted', 'board-copper-exclusion'].includes(code)));
  assert.deepEqual(validation.files, {});

  return { name: 'impossible', issues: validation.issues };
}
