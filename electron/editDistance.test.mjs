import { describe, expect, it, vi } from 'vitest';
import { nearestIds, partCode } from '../src/agent/agentPartRecord.ts';
import { closestLabel, labelIndex } from '../tools/copy/labels.mjs';
import { editDistance } from './editDistance.mjs';

function matrixDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? 0 : j)),
  );

  for (let i = 1; i <= a.length; i++) {
    matrix[i][0] = i;

    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
    }
  }

  return matrix[a.length][b.length];
}

function shortStrings() {
  const strings = [''];
  let level = [''];

  for (let length = 1; length <= 3; length++) {
    level = level.flatMap((prefix) => ['a', 'b', '\ud800', '\udfff'].map((unit) => prefix + unit));
    strings.push(...level);
  }

  return strings;
}

function generatedStrings() {
  let seed = 4147;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    return seed;
  };

  return Array.from({ length: 160 }, () =>
    Array.from({ length: next() % 61 }, () => String.fromCharCode(next() & 65535)).join(''),
  );
}

const words = (text) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function previousIds(parts, wanted, filter) {
  const query = wanted.toLowerCase();
  const score = (part) => {
    const id = part.id.toLowerCase();
    const shared = words(query).filter((word) => words(`${part.id} ${part.name}`).includes(word)).length;
    const contains = id.includes(query) || query.includes(id) ? 2 : 0;

    return matrixDistance(query, id) / Math.max(query.length, id.length, 1) - shared * 0.25 - contains * 0.25;
  };

  return parts
    .filter(filter)
    .map((part) => ({ id: part.id, score: score(part) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((part) => part.id);
}

function previousLabel(index, query) {
  const lower = query.toLowerCase();
  const queryWords = new Set(lower.split(/\s+/));
  const rank = (name) => ({
    name,
    apart: [...new Set(name.toLowerCase().split(/\s+/))].some((word) => queryWords.has(word)) ? 0 : 1,
    cost: matrixDistance(lower, name.toLowerCase()),
  });

  return index.names.map(rank).sort((a, b) => a.apart - b.apart || a.cost - b.cost)[0]?.name ?? null;
}

describe('shared edit distance', () => {
  it('matches a full matrix for every pair of short UTF-16 strings', () => {
    const strings = shortStrings();

    for (const a of strings) {
      for (const b of strings) {
        expect(editDistance(a, b)).toBe(matrixDistance(a, b));
      }
    }
  });

  it('keeps UTF-16 units, empty inputs, unbalanced lengths and independent calls', () => {
    const strings = ['', '🤖', 'é', 'é', '\0', '\n', 'a'.repeat(600), ...generatedStrings()];

    for (let i = 0; i < strings.length; i++) {
      const a = strings[i];
      const b = strings[(i * 37 + 5) % strings.length];
      const expected = matrixDistance(a, b);

      expect(editDistance(a, b)).toBe(expected);
      expect(editDistance(b, a)).toBe(expected);
      expect(editDistance(a, a)).toBe(0);
    }

    expect(editDistance('🤖', '')).toBe(2);
    expect(editDistance('🤖', '🦾')).toBe(1);
  });

  it.each([300, 600])('initializes one short row for %i source characters in either direction', (length) => {
    const long = 'x'.repeat(length);
    const from = vi.spyOn(Array, 'from');
    let result;
    let lengths;

    try {
      result = [editDistance(long, 'xyz'), editDistance('xyz', long), editDistance('', long)];
      lengths = from.mock.calls.map(([shape]) => shape.length);
    } finally {
      from.mockRestore();
    }

    expect(result).toEqual([length - 1, length - 1, length]);
    expect(lengths).toEqual([4, 4]);
  });
});

describe('suggestion rankings', () => {
  const parts = Object.freeze(
    [
      ['left-shoulder-yoke', 'Left Shoulder Yoke'],
      ['left-thigh', 'Left Thigh'],
      ['right-thigh', 'Right Thigh'],
      ['arm-a', 'Arm'],
      ['arm-b', 'Arm'],
      ['', 'Empty'],
      ['HEAD', 'Head 🤖'],
      ['head', 'Head'],
      ['base', 'Support'],
      ...generatedStrings()
        .slice(0, 30)
        .map((id, i) => [id, `Part ${i}`]),
    ].map(([id, name]) => Object.freeze({ id, name, kind: 'cad_part', cad: {} })),
  );

  it('preserves every ordered id, ties, filtering and source edits', () => {
    const queries = ['', 'THIGH', 'shoulder-yoke-left', 'arm', '🤖', ...generatedStrings().slice(0, 60)];

    for (const query of queries) {
      for (const filter of [() => true, (part) => part.id.length % 2 === 0, () => false]) {
        expect(nearestIds(parts, query, filter)).toEqual(previousIds(parts, query, filter));
      }
    }

    const changed = parts.map((part) => ({ ...part, id: `${part.id}-edited`, name: `Changed ${part.name}` }));

    expect(nearestIds(changed, 'edited')).toEqual(previousIds(changed, 'edited', () => true));
    expect(nearestIds([], 'arm')).toEqual([]);
    expect(partCode(parts.slice(0, 2), 'shoulder-yoke-left').error).toBe(
      'No part with id shoulder-yoke-left. Closest CAD parts: left-shoulder-yoke, left-thigh.',
    );
  });

  it('preserves help suggestions, word priority, stable ties and glossary preference', () => {
    const index = labelIndex({
      strings: ['Arm B', 'Arm A', 'Head', 'Robot Package', 'Delete Marks', 'Canvas', 'Canvass'],
    });
    const queries = ['', 'arm', 'Aem', 'Canvas', 'Package Robot', 'HEAD', '🤖', ...generatedStrings()];

    for (const query of queries) expect(closestLabel(index, query)).toBe(previousLabel(index, query));

    expect(closestLabel(index, 'Clear Marks')).toBe('Delete Marks');
    expect(closestLabel(labelIndex({ strings: [] }), 'arm')).toBeNull();
    expect(closestLabel(labelIndex({ strings: ['Changed Head', 'Arm'] }), 'Head')).toBe('Changed Head');
  });
});
