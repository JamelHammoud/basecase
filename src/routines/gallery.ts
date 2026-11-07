export const GALLERY_SCHEMA = 1;
export const EMBEDDING_SIZE = 512;
export const MAX_PHOTOS_PER_PERSON = 16;

export interface GalleryPerson {
  id: string;
  name: string;
  embeddings: number[][];
  enrolledAt: string;
}

export interface Gallery {
  schema: 1;
  people: GalleryPerson[];
}

export interface Match {
  id: string;
  name: string;
  score: number;
}

export const emptyGallery = (): Gallery => ({ schema: GALLERY_SCHEMA, people: [] });

function normalise(v: readonly number[]): number[] {
  const length = Math.hypot(...v);

  return length > 0 ? v.map((x) => x / length) : [...v];
}

const cosine = (a: readonly number[], b: readonly number[]) => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);

export function enroll(
  gallery: Gallery,
  person: { id: string; name: string; embedding: readonly number[]; at: string },
): Gallery {
  const embedding = normalise(person.embedding);
  const existing = gallery.people.find((p) => p.id === person.id);

  if (!existing) {
    const added = { id: person.id, name: person.name, embeddings: [embedding], enrolledAt: person.at };

    return { ...gallery, people: [...gallery.people, added] };
  }

  const embeddings = [...existing.embeddings, embedding].slice(-MAX_PHOTOS_PER_PERSON);

  return {
    ...gallery,
    people: gallery.people.map((p) => (p.id === person.id ? { ...p, name: person.name, embeddings } : p)),
  };
}

export function forget(gallery: Gallery, id: string): Gallery {
  return { ...gallery, people: gallery.people.filter((p) => p.id !== id) };
}

export function bestMatch(gallery: Gallery, embedding: readonly number[]): Match | null {
  const probe = normalise(embedding);
  let best: Match | null = null;

  for (const person of gallery.people) {
    const score = Math.max(...person.embeddings.map((e) => cosine(e, probe)));

    if (!best || score > best.score) best = { id: person.id, name: person.name, score };
  }

  return best;
}

export function readGallery(input: unknown): Gallery {
  const value = input as Partial<Gallery> | null;

  if (!value || value.schema !== GALLERY_SCHEMA || !Array.isArray(value.people)) return emptyGallery();

  const people = value.people.filter(
    (p): p is GalleryPerson =>
      typeof p?.id === 'string' &&
      typeof p.name === 'string' &&
      Array.isArray(p.embeddings) &&
      p.embeddings.every((e) => Array.isArray(e) && e.every((x) => typeof x === 'number' && Number.isFinite(x))),
  );

  return { schema: GALLERY_SCHEMA, people };
}
