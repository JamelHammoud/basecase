import { ELECTRICAL_PIN_MAPS } from './electricalPinMaps';
import { electricalSnapshot } from './electricalSnapshot';
import { electricalSourceJson } from './electricalSource';
import type { ElectricalInput } from './electricalTypes';
import { preparePowerReplay } from './powerReplayPreparation';
import { solvePowerReplay } from './powerReplaySolver';
import { POWER_REPLAY_LIMITS, POWER_REPLAY_METHOD } from './powerReplayTypes';
import type { PowerReplayRecord, PowerReplayRequest } from './powerReplayTypes';

export function replayInput(input: ElectricalInput): ElectricalInput {
  return {
    ...electricalSnapshot(input),
    walk: input.walk,
    wiring: input.wiring,
    pinMaps: structuredClone(input.pinMaps ?? ELECTRICAL_PIN_MAPS),
  };
}

async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(electricalSourceJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bounded(value: unknown) {
  const text = electricalSourceJson(value);

  if (
    text.length > POWER_REPLAY_LIMITS.retainedBytes ||
    new TextEncoder().encode(text).byteLength > POWER_REPLAY_LIMITS.retainedBytes
  )
    throw new Error('Keep retained replay evidence within 4 MB.');
}

export async function retainPowerReplay(request: PowerReplayRequest): Promise<PowerReplayRecord> {
  bounded(request);

  const input = replayInput(request.input);
  const network = preparePowerReplay({ ...request, input });
  const [sourceFingerprint, traceFingerprint, declarationFingerprint] = await Promise.all([
    fingerprint(input),
    fingerprint(request.trace),
    fingerprint(request.declarations),
  ]);
  const record: PowerReplayRecord = {
    schema: 1,
    method: POWER_REPLAY_METHOD,
    input,
    trace: structuredClone(request.trace),
    declarations: structuredClone(request.declarations),
    sourceFingerprint,
    traceFingerprint,
    declarationFingerprint,
    result: solvePowerReplay(network),
  };

  bounded(record);

  return record;
}

export async function reopenPowerReplay(record: PowerReplayRecord, input: ElectricalInput) {
  bounded(record);

  if (record.schema !== 1 || record.method !== POWER_REPLAY_METHOD)
    throw new Error('Open evidence from a supported replay method.');

  const reproduced = await retainPowerReplay(record);

  if (
    record.sourceFingerprint !== reproduced.sourceFingerprint ||
    record.traceFingerprint !== reproduced.traceFingerprint ||
    record.declarationFingerprint !== reproduced.declarationFingerprint ||
    electricalSourceJson(record.result) !== electricalSourceJson(reproduced.result)
  )
    throw new Error('Retained replay evidence differs from its frozen inputs.');

  return {
    applicable: (await fingerprint(replayInput(input))) === record.sourceFingerprint,
    result: reproduced.result,
  };
}
