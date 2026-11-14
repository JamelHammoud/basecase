import type { ConnectionKind, MyPrinter, SlicerKind } from '../data/printers';
import type { PrintMaterial } from '../types/robotics';
import { bytesToBase64 } from '../utils/base64';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';

export interface PrintToolsStatus {
  slicers: Array<{ kind: SlicerKind; name: string; version: string | null }>;
  downloads: Record<string, string>;
  bambuConnect: boolean;
}

export interface SavedPrinter extends MyPrinter {
  hasSecret?: boolean;
}

export interface Discovered {
  name: string;
  host: string;
  kind: ConnectionKind;
  serial?: string;
  modelId?: string | null;
  cloud?: boolean;
}

export interface PrinterStatus {
  state: 'idle' | 'preparing' | 'printing' | 'paused' | 'finished' | 'failed' | 'offline';
  progress?: number;
  layer?: number;
  totalLayers?: number;
  remainingMin?: number;
  job?: string;
  message?: string;
  trays?: Array<{ slot: number; type: string; color: string }>;
}

export interface JobPrinter {
  vendor: string;
  slicers: SlicerKind[];
  machine: string;
  process: string;
  bedType: string | null;
  filaments: Partial<Record<PrintMaterial, string>>;
}

export interface JobGroup {
  material: PrintMaterial;
  bytes: Uint8Array;
  plates: Array<{ number: number; local: number; hash: string }>;
}

export interface JobPayload {
  jobId: string;
  name: string;
  infillPct: number;
  printer: JobPrinter;
  groups: JobGroup[];
  material?: PrintMaterial;
  labels?: string;
}

export interface SlicedPlate {
  number: number;
  local: number;
  material: PrintMaterial;
  hash: string | null;
  seconds: number;
  grams: number;
  support: boolean;
  warnings: string[];
  thumbnail: string | null;
}

export interface SliceRecord {
  slicer: { name: string; version: string | null };
  slicedAt: string;
  cached?: boolean;
  labels?: string;
  plates: SlicedPlate[];
}

const forHttp = (payload: unknown) => {
  const job = payload as Partial<JobPayload> | undefined;

  if (!job?.groups) return payload;

  return { ...job, groups: job.groups.map((g) => ({ ...g, bytes: bytesToBase64(g.bytes) })) };
};

const call = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.printCall, channel, payload, forHttp);

const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function asTools(value: unknown): PrintToolsStatus {
  const v = (value ?? {}) as Partial<PrintToolsStatus>;

  return { slicers: asList(v.slicers), downloads: v.downloads ?? {}, bambuConnect: !!v.bambuConnect };
}

const asSlice = (value: unknown): SliceRecord | null =>
  value && Array.isArray((value as SliceRecord).plates) ? (value as SliceRecord) : null;

export const printBridge = {
  status: async () => asTools(await call('print:status')),
  printers: async () => asList<SavedPrinter>(await call('print:printers')),
  savePrinters: async (list: MyPrinter[]) => asList<SavedPrinter>(await call('print:save-printers', list)),
  setSecret: (id: string, secret: string) =>
    call<{ stored: boolean; hasSecret: boolean }>('print:set-secret', { id, secret }),
  discover: async () => asList<Discovered>(await call('print:discover')),
  test: (id: string) => call<{ ok: boolean; message: string }>('print:test', id),
  printerStatus: (id: string) => call<PrinterStatus | null>('print:printer-status', id),
  control: (id: string, action: 'pause' | 'resume' | 'cancel') =>
    call<{ ok: boolean }>('print:control', { id, action }),
  open: (payload: JobPayload) => call<{ opened: string; file: string }>('print:open', payload),
  slice: async (payload: JobPayload) => {
    const record = asSlice(await call('print:slice', payload));

    if (!record) throw new Error('The slicer returned no plates. Slice again.');

    return record;
  },
  lastSlice: async (jobId: string) => asSlice(await call('print:last-slice', jobId)),
  stopSlice: (jobId: string) => call<{ stopping: boolean }>('print:stop-slice', jobId),
  send: (payload: {
    jobId: string;
    plate: number;
    printerId: string;
    start?: boolean;
    useAms?: boolean;
    amsMapping?: number[];
  }) => call<{ started: boolean; message: string }>('print:send', payload),
  reveal: (jobId: string) => call<boolean>('print:reveal', jobId),
  openLink: (url: string) => call<boolean>('print:open-link', url),
};
