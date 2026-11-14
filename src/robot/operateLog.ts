export interface LogStatus {
  t: number;
  mode: string;
  run: string;
  q: Array<number | null>;
  v?: Array<number | null>;
  e?: Array<number | null>;
}

export interface LogIntent {
  t: number;
  q: number[];
}

export interface LogInput {
  t: number;
  id: string;
  values: Array<number | null>;
}

export interface LogTwin {
  t: number;
  q: Array<number | null>;
}

export interface LogFault {
  t: number;
  code: string;
  id: number | null;
  message: string;
}

export interface OperateLog {
  statuses: LogStatus[];
  intents: LogIntent[];
  inputs: LogInput[];
  twins: LogTwin[];
  faults: LogFault[];
}

type Line = Record<string, unknown>;

const isValues = (v: unknown): v is Array<number | null> =>
  Array.isArray(v) && v.every((x) => x === null || (typeof x === 'number' && Number.isFinite(x)));

const optional = (v: unknown) => (isValues(v) ? { values: v } : null);

function readStatus(line: Line, log: OperateLog) {
  if (!isValues(line.q)) return;

  const v = optional(line.v);
  const e = optional(line.e);

  log.statuses.push({
    t: line.t as number,
    mode: String(line.mode ?? ''),
    run: String(line.run ?? ''),
    q: line.q,
    ...(v ? { v: v.values } : {}),
    ...(e ? { e: e.values } : {}),
  });
}

const READERS: Record<string, (line: Line, log: OperateLog) => void> = {
  status: readStatus,
  intent: (line, log) => {
    if (isValues(line.q)) log.intents.push({ t: line.t as number, q: line.q.map((v) => v ?? NaN) });
  },
  input: (line, log) => {
    if (typeof line.id === 'string' && isValues(line.values))
      log.inputs.push({ t: line.t as number, id: line.id, values: line.values });
  },
  twin: (line, log) => {
    if (isValues(line.q)) log.twins.push({ t: line.t as number, q: line.q });
  },
  fault: (line, log) => {
    log.faults.push({
      t: line.t as number,
      code: String(line.code ?? ''),
      id: typeof line.id === 'number' ? line.id : null,
      message: String(line.message ?? ''),
    });
  },
};

function parsed(text: string): Line | null {
  try {
    const line: unknown = JSON.parse(text);

    return typeof line === 'object' && line !== null && typeof (line as Line).t === 'number' ? (line as Line) : null;
  } catch {
    return null;
  }
}

export function readOperateLog(text: string): OperateLog {
  const log: OperateLog = { statuses: [], intents: [], inputs: [], twins: [], faults: [] };

  for (const raw of text.split('\n')) {
    const line = raw ? parsed(raw) : null;

    if (line) READERS[String(line.k)]?.(line, log);
  }

  return log;
}
