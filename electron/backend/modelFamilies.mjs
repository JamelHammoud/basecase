const VERSION = /(\d+(?:\.\d+)*)/;

function versionOf(name) {
  const match = name.match(VERSION);

  if (!match) return undefined;

  const parts = match[1].split('.').map(Number);

  return { parts, family: name.replace(match[0], ' ').replace(/\s+/g, ' ').trim().toLowerCase() };
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);

    if (diff) return diff;
  }

  return 0;
}

function newestByFamily(versioned) {
  const newest = new Map();

  for (const { model, version } of versioned) {
    const best = newest.get(version.family);

    if (!best || compareVersions(version.parts, best.version.parts) > 0) newest.set(version.family, { model, version });
  }

  return newest;
}

export function latestModels(models, keepId) {
  const versioned = models.map((model) => ({ model, version: versionOf(model.name) })).filter((m) => m.version);

  if (!versioned.length) return models;

  const newestMajor = Math.max(...versioned.map((m) => m.version.parts[0]));
  const newest = new Set(
    [...newestByFamily(versioned).values()].filter((m) => m.version.parts[0] === newestMajor).map((m) => m.model.id),
  );

  return models.filter((model) => model.id === keepId || !versionOf(model.name) || newest.has(model.id));
}
