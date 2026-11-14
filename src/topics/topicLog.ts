export type Decoded = number | string | boolean | Uint8Array | Float64Array | Decoded[] | DecodedMessage | null;

export interface DecodedMessage {
  [field: string]: Decoded;
}

export interface Ragged {
  at: Uint32Array;
  v: Float64Array;
}

export interface RaggedBytes {
  at: Uint32Array;
  bytes: Uint8Array;
}

export interface RecordedTopic {
  topic: string;
  schema: string;
  t: Float64Array;
  numbers: Map<string, Float64Array>;
  labels: Map<string, string[]>;
  lists: Map<string, Ragged>;
  blobs: Map<string, RaggedBytes>;
  clipped: boolean;
}

export interface TopicLog {
  topics: RecordedTopic[];
}

export const TOPIC_LIMITS = {
  topics: 512,
  columns: 2048,
  items: 64,
  messages: 2_000_000,
  cells: 32_000_000,
  listValues: 16_000_000,
  blobBytes: 256 * 1024 * 1024,
  topicBlobBytes: 64 * 1024 * 1024,
  labelChars: 64 * 1024 * 1024,
  pathChars: 200,
};

export const ROOT_PATH = 'value';

export const raggedItem = (r: { at: Uint32Array }, message: number) => [r.at[message], r.at[message + 1]] as const;
