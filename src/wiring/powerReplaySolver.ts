import type { PowerReplayResult, ReplayNetwork } from './powerReplayTypes';
import { POWER_REPLAY_LIMITS, POWER_REPLAY_METHOD } from './powerReplayTypes';

function fillAdjacency(network: ReplayNetwork, adjacency: Map<string, number[]>) {
  for (const [index, segment] of network.segments.entries()) {
    for (const vertex of [segment.from, segment.to]) {
      const connected = adjacency.get(vertex) ?? [];

      connected.push(index);
      adjacency.set(vertex, connected);
    }
  }
}

function orderedTree(network: ReplayNetwork) {
  const reached = new Set([network.sourceId]);
  const pending = [network.sourceId];
  const adjacency = new Map<string, number[]>();
  const segments: ReplayNetwork['segments'] = [];
  const used = new Set<number>();

  fillAdjacency(network, adjacency);

  for (let cursor = 0; cursor < pending.length; cursor++) {
    const from = pending[cursor];

    for (const index of adjacency.get(from) ?? []) {
      if (used.has(index)) continue;

      used.add(index);

      const segment = network.segments[index];
      const to = segment.from === from ? segment.to : segment.from;

      if (reached.has(to)) throw new Error('Use connected cable trees without parallel paths or cycles.');

      reached.add(to);
      pending.push(to);
      segments.push({ ...segment, from, to });
    }
  }

  if (
    reached.size !== network.vertices.length ||
    used.size !== network.segments.length ||
    !network.loads.every((load) => reached.has(load.node))
  )
    throw new Error('Connect every load and return conductor to the declared source.');

  return segments;
}

function validateSource(network: ReplayNetwork) {
  const source = network.source;
  const finite = (n: number) => Number.isFinite(n) && n >= 0;

  return (
    finite(source.volts) &&
    source.volts > 0 &&
    finite(source.ohms) &&
    finite(source.minimumV) &&
    finite(source.maximumA) &&
    source.maximumA > 0
  );
}

function validateNetwork(network: ReplayNetwork) {
  const samples = network.loads[0]?.amps.length ?? 0;
  const finite = (n: number) => Number.isFinite(n) && n >= 0;

  if (
    network.method !== POWER_REPLAY_METHOD ||
    !samples ||
    samples > POWER_REPLAY_LIMITS.samples ||
    network.loads.length > POWER_REPLAY_LIMITS.loads ||
    network.segments.length > POWER_REPLAY_LIMITS.segments ||
    new Set(network.vertices).size !== network.vertices.length ||
    !network.vertices.includes(network.sourceId) ||
    !Number.isFinite(network.windowS) ||
    network.windowS <= 0 ||
    !validateSource(network)
  )
    throw new Error('Use finite inputs within the supported replay limits.');

  if (
    network.loads.some((load) => load.amps.length !== samples || load.amps.some((a) => !finite(a))) ||
    network.segments.some((segment) => !finite(segment.outgoingOhms) || !finite(segment.returnOhms))
  )
    throw new Error('Use synchronized nonnegative currents and resistances.');

  return samples;
}

function blankResult(network: ReplayNetwork, segments: ReplayNetwork['segments']): PowerReplayResult {
  return {
    method: POWER_REPLAY_METHOD,
    status: 'complete',
    windowS: network.windowS,
    sourceA: [],
    sourceLossW: [],
    lossW: [],
    endpoints: network.loads.map(({ partId, jointId }) => ({ partId, jointId, volts: [] })),
    segments: segments.map(({ id, name, from, to, partIds }) => ({ id, name, from, to, partIds, amps: [], lossW: [] })),
    limiting: { partId: network.loads[0].partId, sample: 0, timeS: 0, volts: Infinity },
    limit: null,
  };
}

function solveSample(network: ReplayNetwork, segments: ReplayNetwork['segments'], sample: number) {
  const currents = new Map(network.vertices.map((id) => [id, 0]));
  const drops = new Map<string, number>();
  const segmentA = new Float64Array(segments.length);
  const segmentW = new Float64Array(segments.length);

  for (const load of network.loads) currents.set(load.node, (currents.get(load.node) ?? 0) + load.amps[sample]);

  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    const amps = currents.get(segment.to)!;

    currents.set(segment.from, currents.get(segment.from)! + amps);
    segmentA[index] = amps;
    segmentW[index] = amps * amps * (segment.outgoingOhms + segment.returnOhms);
  }

  const sourceA = currents.get(network.sourceId)!;
  const sourceLossW = sourceA * sourceA * network.source.ohms;
  const lossW = sourceLossW + segmentW.reduce((sum, watts) => sum + watts, 0);

  drops.set(network.sourceId, sourceA * network.source.ohms);

  for (const [index, segment] of segments.entries())
    drops.set(segment.to, drops.get(segment.from)! + segmentA[index] * (segment.outgoingOhms + segment.returnOhms));

  const volts = network.loads.map((load) => network.source.volts - drops.get(load.node)!);

  if (![sourceA, lossW, ...volts].every(Number.isFinite))
    throw new Error('Reduce the load or resistance to stay within finite model arithmetic.');

  return { sourceA, sourceLossW, lossW, segmentA, segmentW, volts };
}

function retainSample(result: PowerReplayResult, values: ReturnType<typeof solveSample>, sample: number) {
  result.sourceA.push(values.sourceA);
  result.sourceLossW.push(values.sourceLossW);
  result.lossW.push(values.lossW);

  for (const [index, endpoint] of result.endpoints.entries()) {
    const volts = values.volts[index];

    endpoint.volts.push(volts);

    if (volts < result.limiting.volts)
      result.limiting = { partId: endpoint.partId, sample, timeS: sample * result.windowS, volts };
  }

  for (const [index, segment] of result.segments.entries()) {
    segment.amps.push(values.segmentA[index]);
    segment.lossW.push(values.segmentW[index]);
  }
}

export function solvePowerReplay(network: ReplayNetwork): PowerReplayResult {
  const samples = validateNetwork(network);
  const segments = orderedTree(network);
  const result = blankResult(network, segments);

  for (let sample = 0; sample < samples; sample++) {
    const values = solveSample(network, segments, sample);
    const voltage = values.volts.some((v) => v <= 0 || v < network.source.minimumV);
    const current = values.sourceA > network.source.maximumA;

    retainSample(result, values, sample);

    if (!result.limit && (voltage || current)) result.limit = { sample, reason: voltage ? 'voltage' : 'current' };
  }

  result.status = result.limit ? 'limit' : 'complete';

  return result;
}
