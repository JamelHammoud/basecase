import type { TryVerdict } from '../tryFile';
import { SIGNATURE_SAMPLES } from './motion';
import { SEGMENT_BOOSTS, TRY_BOOSTS, type Entry } from './searchDocs';
import type { StoredFrames } from './searchHits';
import { decodeSnapshot, encodeSnapshot } from './searchSnapshot';
import { TermIndex, type SavedTerms } from './termIndex';
import type { TextIndexes } from './wordMatch';

export interface TryFacts {
  slot: number;
  segments: number[];
  stamp: number;
  robot: string;
  input: string | null;
}

export interface IndexState {
  text: TextIndexes;
  entryAt: Array<Entry | null>;
  slotOf: Map<string, number>;
  tries: Map<string, TryFacts>;
  frames: Map<string, StoredFrames>;
}

type SavedBase = Omit<Entry, 'signature' | 'id' | 'segmentId' | 'at' | 'end' | 'length' | 'slot' | 'parent'>;

type SavedSegment = [id: string, label: string, verdict: TryVerdict, at: number, end: number, signed: 0 | 1];

interface SavedTry {
  base: SavedBase;
  signed: 0 | 1;
  segments: SavedSegment[];
  stamp: number;
}

interface Header {
  tries: SavedTerms;
  segments: SavedTerms;
  saved: SavedTry[];
  frames: Array<[string, number[], number]>;
}

const SIGNATURE_LENGTH = SIGNATURE_SAMPLES * 4;

const signed = (e: Entry): 0 | 1 => (e.signature?.length === SIGNATURE_LENGTH ? 1 : 0);

const baseOf = (e: Entry): SavedBase => ({
  tryId: e.tryId,
  label: e.label,
  robot: e.robot,
  sceneId: e.sceneId,
  input: e.input,
  source: e.source,
  verdict: e.verdict,
  seconds: e.seconds,
  startedAt: e.startedAt,
  time: e.time,
  faulted: e.faulted,
  key: e.key,
});

function joined(parts: Int8Array[]): Int8Array {
  const out = new Int8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}

function savedTries(state: IndexState, signatures: Int8Array[], moved: Map<number, number>): SavedTry[] {
  return [...state.tries.values()].map((facts) => {
    const base = state.entryAt[facts.slot]!;
    const segments = facts.segments.map((slot) => state.entryAt[slot]!);

    for (const e of [base, ...segments]) {
      moved.set(e.slot, moved.size);

      if (signed(e)) signatures.push(e.signature!);
    }

    return {
      base: baseOf(base),
      signed: signed(base),
      stamp: facts.stamp,
      segments: segments.map((s) => [s.segmentId!, s.label, s.verdict, s.at, s.end ?? s.at, signed(s)]),
    };
  });
}

export function writeIndexSnapshot(state: IndexState): Uint8Array {
  const signatures: Int8Array[] = [];
  const moved = new Map<number, number>();
  const saved = savedTries(state, signatures, moved);
  const remap = (slot: number) => moved.get(slot);
  const frames = [...state.frames];
  const header: Header = {
    tries: state.text.tries.saved(remap),
    segments: state.text.segments.saved(remap),
    saved,
    frames: frames.map(([id, f]) => [id, f.at, f.dim]),
  };

  return encodeSnapshot({ header, blobs: [joined(signatures), joined(frames.map(([, f]) => f.vectors))] });
}

function signatureReader(all: Int8Array) {
  let at = 0;

  return (present: 0 | 1) => {
    if (!present) return null;

    at += SIGNATURE_LENGTH;

    return all.subarray(at - SIGNATURE_LENGTH, at);
  };
}

function readTries(saved: SavedTry[], signatures: Int8Array) {
  const entryAt: Entry[] = [];
  const tries = new Map<string, TryFacts>();
  const next = signatureReader(signatures);

  for (const { base, signed: present, segments, stamp } of saved) {
    const parent = entryAt.length;
    const entry: Entry = {
      ...base,
      id: base.tryId,
      segmentId: null,
      at: 0,
      end: null,
      length: base.seconds,
      signature: next(present),
      slot: parent,
      parent,
    };

    entryAt.push(entry);

    for (const [segmentId, label, verdict, at, end, has] of segments) {
      const id = `${base.tryId}/${segmentId}`;
      const slot = entryAt.length;

      entryAt.push({ ...entry, id, segmentId, label, verdict, at, end, length: end - at, signature: next(has), slot });
    }

    tries.set(base.tryId, {
      slot: parent,
      segments: segments.map((_, i) => parent + 1 + i),
      stamp,
      robot: base.robot,
      input: base.input,
    });
  }

  return { entryAt, slotOf: new Map(entryAt.map((e) => [e.id, e.slot])), tries };
}

function readFrames(saved: Header['frames'], vectors: Int8Array): Map<string, StoredFrames> {
  const frames = new Map<string, StoredFrames>();
  let offset = 0;

  for (const [id, at, dim] of saved) {
    const size = at.length * dim;

    frames.set(id, { at, dim, vectors: vectors.subarray(offset, offset + size) });
    offset += size;
  }

  return frames;
}

export function readIndexSnapshot(bytes: Uint8Array): IndexState | null {
  const snapshot = decodeSnapshot<Header>(bytes);

  if (!snapshot || snapshot.blobs.length !== 2) return null;

  const { header, blobs } = snapshot;

  return {
    text: { tries: new TermIndex(TRY_BOOSTS, header.tries), segments: new TermIndex(SEGMENT_BOOSTS, header.segments) },
    ...readTries(header.saved, blobs[0]),
    frames: readFrames(header.frames, blobs[1]),
  };
}
