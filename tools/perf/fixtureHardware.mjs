const FASTENERS = [
  {
    spec: { type: 'socket_head', size: 'M3', length: 6, finish: 'black', drive: 'hex' },
    share: 144,
    size: [5.5, 9, 5.5],
  },
  {
    spec: { type: 'socket_head', size: 'M2', length: 6, finish: 'black', drive: 'hex' },
    share: 71,
    size: [3.8, 8, 3.8],
  },
  { spec: { type: 'heat_insert', size: 'M3', length: 5.7, finish: 'brass' }, share: 53, size: [5, 5.7, 5] },
  {
    spec: { type: 'socket_head', size: 'M3', length: 10, finish: 'black', drive: 'hex' },
    share: 23,
    size: [5.5, 13, 5.5],
  },
  {
    spec: { type: 'countersunk', size: 'M3', length: 12, finish: 'stainless', drive: 'hex' },
    share: 16,
    size: [6, 12, 6],
  },
  { spec: { type: 'heat_insert', size: 'M3', length: 4, finish: 'brass' }, share: 16, size: [5, 4, 5] },
  { spec: { type: 'hex_nut', size: 'M3', finish: 'stainless' }, share: 40, size: [5.5, 2.4, 6.4] },
  { spec: { type: 'washer', size: 'M3', finish: 'stainless' }, share: 37, size: [7, 0.5, 7] },
];

const SERVOS = 12;

const COLORS = { black: '#18181b', brass: '#c9a14a', stainless: '#d4d4d8' };

const random = (seed) => () => {
  seed = (seed * 16807) % 2147483647;

  return seed / 2147483647;
};

const part = (base) => ({
  rotation: [0, 0, 0],
  note: '',
  visible: true,
  locked: false,
  role: 'solid',
  mechanicalTag: 'Off-the-shelf COTS',
  ...base,
});

export function hardwareFixture(parts) {
  const next = random(7);
  const anchors = parts.filter((p) => p.id.endsWith('-shell'));
  const at = (i) => {
    const host = anchors[i % anchors.length];
    const half = [host.dimensions.width, host.dimensions.height, host.dimensions.depth].map((v) => v / 2);

    return host.position.map((v, k) => Math.round(v + (next() * 2 - 1) * half[k] * 0.9));
  };
  const fasteners = FASTENERS.flatMap(({ spec, share, size }, kind) =>
    Array.from({ length: share }, (_, i) =>
      part({
        id: `hw-${kind}-${i}`,
        name: `${spec.size} ${spec.type}`,
        group: { id: 'perf-hardware', name: 'Hardware' },
        kind: 'hardware',
        category: 'hardware',
        position: at(kind * 400 + i),
        rotation: [Math.round(next() * 4) * 90, 0, 0],
        dimensions: { width: size[0], height: size[1], depth: size[2] },
        color: COLORS[spec.finish],
        hardware: spec,
      }),
    ),
  );
  const servos = Array.from({ length: SERVOS }, (_, i) =>
    part({
      id: `servo-${i}`,
      name: `Servo ${i}`,
      group: { id: 'perf-servos', name: 'Servos' },
      kind: 'component',
      category: 'actuators',
      position: at(i * 3),
      dimensions: { width: 45.223, height: 37.8, depth: 24.723 },
      color: '#18181b',
      componentId: 'feetech-sts3215',
    }),
  );

  return [...fasteners, ...servos];
}
