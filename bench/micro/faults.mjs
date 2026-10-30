import { moveScrew, resizeScrew } from './parts.mjs';

export const dropPart = (fixture, id) => ({ ...fixture, parts: fixture.parts.filter((p) => p.id !== id) });

export const mapPart = (fixture, id, fn) => ({
  ...fixture,
  parts: fixture.parts.map((p) => (p.id === id ? fn(p) : p)),
});

export const shortenScrew = (fixture, id, byMm) => mapPart(fixture, id, (p) => resizeScrew(p, p.fixture.length - byMm));

export const slideScrew = (fixture, id, mm) =>
  mapPart(fixture, id, (p) => moveScrew(p, { sideways: fixture.meta.slide.map((v) => v * mm) }));

export const sinkScrew = (fixture, id, mm) => mapPart(fixture, id, (p) => moveScrew(p, { deeper: mm }));

export const FAULTS = {
  missingInsert: (f) => dropPart(f, f.meta.inserts[0]),
  shortScrew: (f) => shortenScrew(f, f.meta.screws[0], 4),
  sideways: (f) => slideScrew(f, f.meta.screws[0], 2),
  sunk: (f) => sinkScrew(f, f.meta.screws[0], 3),
};
