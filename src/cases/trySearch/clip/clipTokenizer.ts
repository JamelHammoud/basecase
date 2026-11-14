export const CONTEXT_LENGTH = 77;
export const START_TOKEN = 49406;
export const END_TOKEN = 49407;
export const PAD_TOKEN = 0;

const WORD_END = '</w>';
const PIECES = /'s|'t|'re|'ve|'m|'ll|'d|\p{L}+|\p{N}|[^\s\p{L}\p{N}]+/gu;

function byteChars(): string[] {
  const kept: number[] = [];

  for (let b = 33; b <= 126; b++) kept.push(b);

  for (let b = 161; b <= 172; b++) kept.push(b);

  for (let b = 174; b <= 255; b++) kept.push(b);

  const chars: string[] = [];
  let extra = 0;

  for (let b = 0; b < 256; b++) chars[b] = String.fromCharCode(kept.includes(b) ? b : 256 + extra++);

  return chars;
}

const BYTE_CHARS = byteChars();
const ORDERED_BYTES = [...BYTE_CHARS].sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0));

export interface ClipTokenizer {
  encode: (text: string) => number[];
}

export const normalizeText = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').toLowerCase();

function bytePieces(piece: string): string[] {
  return [...new TextEncoder().encode(piece)].map((b) => BYTE_CHARS[b]);
}

function lowestPair(parts: string[], ranks: Map<string, number>) {
  let best = -1;
  let bestRank = Infinity;

  for (let i = 0; i < parts.length - 1; i++) {
    const rank = ranks.get(`${parts[i]} ${parts[i + 1]}`);

    if (rank !== undefined && rank < bestRank) {
      bestRank = rank;
      best = i;
    }
  }

  return best;
}

function bpe(piece: string, ranks: Map<string, number>): string[] {
  const parts = bytePieces(piece);

  parts[parts.length - 1] += WORD_END;

  for (let at = lowestPair(parts, ranks); at >= 0; at = lowestPair(parts, ranks)) {
    parts.splice(at, 2, parts[at] + parts[at + 1]);
  }

  return parts;
}

export function vocabOf(merges: string[]): Map<string, number> {
  const tokens = [
    ...ORDERED_BYTES,
    ...ORDERED_BYTES.map((c) => c + WORD_END),
    ...merges.map((m) => m.replace(' ', '')),
  ];

  return new Map(tokens.map((token, id) => [token, id]));
}

export function clipTokenizer(mergesText: string): ClipTokenizer {
  const merges = mergesText.split('\n').filter((line) => line.includes(' '));
  const ranks = new Map(merges.map((m, rank) => [m, rank]));
  const vocab = vocabOf(merges);
  const cache = new Map<string, number[]>();

  const idsOf = (piece: string) => {
    const known = cache.get(piece);

    if (known) return known;

    const ids = bpe(piece, ranks).map((token) => vocab.get(token) ?? END_TOKEN);

    cache.set(piece, ids);

    return ids;
  };

  return {
    encode: (text) => {
      const ids = (normalizeText(text).match(PIECES) ?? []).flatMap(idsOf).slice(0, CONTEXT_LENGTH - 2);
      const tokens = [START_TOKEN, ...ids, END_TOKEN];

      return [...tokens, ...Array<number>(CONTEXT_LENGTH - tokens.length).fill(PAD_TOKEN)];
    },
  };
}
