import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OnshapeAccount } from '../electron/onshape/index.mjs';

export const KEYS = { access: 'AccessKey0123456789abcdef', secret: 'SecretKey0123456789abcdefSecretKey0123456789abcd' };

const DID = 'd0c0000000000000000000d1';
const WID = 'ee0000000000000000000001';
const EID = 'a55e00000000000000000e01';
const STUDIO = 'b0d1e5000000000000000001';
const MICRO = 'f00000000000000000000001';

export const ONSHAPE_LINK = `https://cad.onshape.com/documents/${DID}/w/${WID}/e/${EID}`;

type Vec = [number, number, number];

export interface ArmOptions {
  mate?: string;
  angleDeg?: number;
  gripper?: boolean;
  brace?: boolean;
  limits?: [string, string] | null;
}

interface Box {
  id: string;
  partId: string;
  name: string;
  size: Vec;
  at: Vec;
  turnDeg?: number;
  massKg?: number;
}

const rowMajor = ({ at, turnDeg = 0 }: Box) => {
  const c = Math.cos((turnDeg * Math.PI) / 180);
  const s = Math.sin((turnDeg * Math.PI) / 180);

  return [c, 0, s, at[0], 0, 1, 0, at[1], -s, 0, c, at[2], 0, 0, 0, 1];
};

const instance = (b: Box) => ({
  id: b.id,
  type: 'Part',
  name: b.name,
  partId: b.partId,
  documentId: DID,
  elementId: STUDIO,
  documentMicroversion: MICRO,
  configuration: 'default',
  suppressed: false,
});

const Y_AXIS_CS = (origin: Vec) => ({ origin, xAxis: [1, 0, 0], yAxis: [0, 0, -1], zAxis: [0, 1, 0] });

const mateFeature = (id: string, name: string, mateType: string, ends: Array<{ path: string[]; origin: Vec }>) => ({
  id,
  featureType: 'mate',
  suppressed: false,
  featureData: {
    name,
    mateType,
    matedEntities: ends.map((e) => ({ matedOccurrence: e.path, matedCS: Y_AXIS_CS(e.origin) })),
  },
});

const limitFeature = (featureId: string, mateType: string, [lo, hi]: [string, string]) => {
  const [loId, hiId] = mateType === 'SLIDER' ? ['limitZMin', 'limitZMax'] : ['limitAxialZMin', 'limitAxialZMax'];

  return {
    btType: 'BTMMate-64',
    featureId,
    parameters: [
      { btType: 'BTMParameterEnum-145', parameterId: 'mateType', value: mateType },
      { btType: 'BTMParameterBoolean-144', parameterId: 'limitsEnabled', value: true },
      { btType: 'BTMParameterNullableQuantity-807', parameterId: loId, expression: lo, isNull: false },
      { btType: 'BTMParameterNullableQuantity-807', parameterId: hiId, expression: hi, isNull: false },
    ],
  };
};

export function fakeArm({
  mate = 'REVOLUTE',
  angleDeg = 0,
  gripper = false,
  brace = false,
  limits = ['-90 deg', '45 deg'],
}: ArmOptions = {}) {
  const base: Box = { id: 'IBase', partId: 'JHD', name: 'Base', size: [60, 60, 40], at: [0, 0, 0], massKg: 0.5 };
  const arm: Box = { id: 'IArm', partId: 'JID', name: 'Arm', size: [20, 20, 120], at: [0, 0, 0.04], turnDeg: angleDeg };
  const grip: Box = { id: 'IGrip', partId: 'JJD', name: 'Gripper', size: [30, 10, 10], at: [0, 0, 0.16] };
  const boxes = gripper ? [base, arm, grip] : [base, arm];
  const features = [
    mateFeature('Melbow', 'Elbow', mate, [
      { path: ['IBase'], origin: [0, 0, 0.04] },
      { path: ['IArm'], origin: [0, 0, 0] },
    ]),
    ...(gripper
      ? [
          mateFeature('Mgrip', 'Fastened 1', 'FASTENED', [
            { path: ['IArm'], origin: [0, 0, 0.12] },
            { path: ['IGrip'], origin: [0, 0, 0] },
          ]),
        ]
      : []),
    ...(brace
      ? [
          mateFeature('Mbrace', 'Brace', 'REVOLUTE', [
            { path: ['IBase'], origin: [0.02, 0, 0.04] },
            { path: ['IArm'], origin: [0.02, 0, 0] },
          ]),
        ]
      : []),
  ];

  return {
    boxes,
    definition: {
      rootAssembly: {
        instances: boxes.map(instance),
        occurrences: boxes.map((b) => ({ path: [b.id], transform: rowMajor(b), fixed: b === base, hidden: false })),
        features,
      },
      subAssemblies: [],
    },
    features: { features: limits ? [limitFeature('Melbow', mate, limits)] : [] },
  };
}

export type FakeArm = ReturnType<typeof fakeArm>;

export interface Seen {
  url: string;
  authorization: string | null;
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const authorized = (headers: Record<string, string>) =>
  headers.Authorization === `Basic ${Buffer.from(`${KEYS.access}:${KEYS.secret}`).toString('base64')}`;

function massReply(arm: FakeArm, partId: string) {
  const box = arm.boxes.find((b) => b.partId === partId);

  return {
    bodies: {
      [partId]: {
        hasMass: !!box?.massKg,
        mass: [box?.massKg ?? 0, 0, 0],
        centroid: [0, 0, (box?.size[2] ?? 0) / 2000],
      },
    },
  };
}

type Route = (url: URL, arm: FakeArm) => Response | null;

const ROUTES: Array<[RegExp, Route]> = [
  [/^\/api\/v10\/users\/sessioninfo$/, () => json({ name: 'Test Account' })],
  [/^\/api\/v10\/documents\/[0-9a-f]{24}$/, () => json({ name: 'Desk Arm' })],
  [/^\/api\/v10\/assemblies\/d\/\w+\/w\/\w+\/e\/\w+\/features$/, (_u, arm) => json(arm.features)],
  [/^\/api\/v10\/assemblies\/d\/\w+\/w\/\w+\/e\/\w+$/, (_u, arm) => json(arm.definition)],
  [/\/partid\/(\w+)\/massproperties$/, (u, arm) => json(massReply(arm, /partid\/(\w+)\//.exec(u.pathname)![1]))],
  [
    /\/translations\/(c[0-9a-f]+)$/,
    (u) =>
      json({
        id: u.pathname.split('/').pop(),
        requestState: 'DONE',
        resultExternalDataIds: [u.pathname.split('/').pop()!.replace('c', 'e')],
      }),
  ],
  [
    /\/externaldata\/(e[0-9a-f]+)$/,
    (u) => new Response(null, { status: 307, headers: { location: `/api/v10/blobs/${u.pathname.split('/').pop()}` } }),
  ],
];

const idOf = (partId: string) =>
  `${partId
    .split('')
    .map((c) => c.charCodeAt(0).toString(16))
    .join('')}`.padEnd(23, '0');

function stepOf(arm: FakeArm, xid: string) {
  const box = arm.boxes.find((b) => `e${idOf(b.partId)}` === xid);

  return box ? new Response(`BOX ${box.size.join(' ')}`) : new Response(null, { status: 404 });
}

export function fakeOnshapeFetch(arm: FakeArm, seen: Seen[] = []) {
  return async (url: string, init: { method?: string; body?: string; headers: Record<string, string> }) => {
    const u = new URL(url);

    seen.push({ url, authorization: init.headers.Authorization ?? null });

    if (u.origin !== 'https://cad.onshape.com') throw new Error(`left Onshape for ${u.origin}`);

    if (!authorized(init.headers)) return json({ message: `bad ${init.headers.Authorization}` }, 401);

    if (init.method === 'POST' && u.pathname.endsWith('/translations')) {
      return json({ id: `c${idOf(JSON.parse(init.body ?? '{}').partIds)}`, requestState: 'ACTIVE' });
    }

    if (u.pathname.startsWith('/api/v10/blobs/')) return stepOf(arm, u.pathname.split('/').pop()!);

    const route = ROUTES.find(([pattern]) => pattern.test(u.pathname));

    return route?.[1](u, arm) ?? new Response(null, { status: 404 });
  };
}

function boxBody(size: Vec) {
  const [w, d, h] = size;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [
    i & 1 ? w / 2 : -w / 2,
    i & 2 ? d / 2 : -d / 2,
    i & 4 ? h / 2 : -h / 2,
  ]);
  const faces = [
    0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
  ];
  const data = new Uint8Array(corners.length * 4 + faces.length * 4);

  data.set(new Uint8Array(new Float32Array(corners).buffer), 0);
  data.set(new Uint8Array(new Uint32Array(faces).buffer), corners.length * 4);

  return {
    header: {
      ok: true,
      bodies: [{ name: 'Body', color: '#808080', center: [0, 0, h / 2], size, vertices: 8, triangles: 12 }],
    },
    data,
  };
}

const converterReply = ({ header, data }: ReturnType<typeof boxBody>) =>
  Buffer.concat([Buffer.from(JSON.stringify(header)), Buffer.from([0x0a]), data]);

export const fakeConverter = {
  convert: async ({ bytes }: { bytes: Uint8Array }) => {
    const size = new TextDecoder().decode(bytes).split(' ').slice(1).map(Number) as Vec;

    return new Uint8Array(converterReply(boxBody(size)));
  },
};

export const memorySecrets = () => ({
  available: () => true,
  encrypt: (value: string) => `sealed:${Buffer.from(value).toString('base64').split('').reverse().join('')}`,
  decrypt: (sealed: string) => Buffer.from(sealed.slice(7).split('').reverse().join(''), 'base64').toString(),
});

export function fakeAccount(arm: FakeArm, seen: Seen[] = []) {
  return new OnshapeAccount({
    libraryDir: mkdtempSync(path.join(os.tmpdir(), 'onshape-')),
    secrets: memorySecrets(),
    converter: fakeConverter,
    fetchImpl: fakeOnshapeFetch(arm, seen),
    sleep: async () => {},
  });
}

export async function signedIn(arm: FakeArm, seen: Seen[] = []) {
  const account = fakeAccount(arm, seen);

  await account.setKey({ kind: 'access', value: KEYS.access });
  await account.setKey({ kind: 'secret', value: KEYS.secret });

  return account;
}
