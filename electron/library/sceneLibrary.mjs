import fs from 'node:fs';
import path from 'node:path';

const SUMMARY_FIELDS = ['id', 'name', 'globalGoal', 'updatedAt', 'previewDataUrl', 'sizeMm'];

const isSceneFile = (file) => file.endsWith('.json') && !file.startsWith('.');

const slug = (name) =>
  name
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function summarize(record) {
  const parts = Array.isArray(record.parts) ? record.parts : [];
  const summary = Object.fromEntries(SUMMARY_FIELDS.filter((k) => record[k] !== undefined).map((k) => [k, record[k]]));

  return {
    ...summary,
    globalGoal: record.globalGoal || '',
    partCount: parts.length || record.partCount || 0,
    catalogCount: parts.filter((p) => p.kind === 'component' || p.hardware).length,
    commentCount: Array.isArray(record.annotations) ? record.annotations.length : 0,
  };
}

const newest = (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '');

export class SceneLibrary {
  constructor({ scenesDir, cacheFile }) {
    this.scenesDir = scenesDir;
    this.cacheFile = cacheFile;
    this.cache = this.readCache();
  }

  readCache() {
    try {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'))));
    } catch {
      return new Map();
    }
  }

  writeCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(Object.fromEntries(this.cache)), 'utf-8');
    } catch {}
  }

  filePath(id) {
    return path.join(this.scenesDir, `${id}.json`);
  }

  summaryOf(file) {
    const full = path.join(this.scenesDir, file);
    const stat = fs.statSync(full);
    const cached = this.cache.get(file);

    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return { summary: cached.summary, fresh: false };
    }

    const summary = summarize(JSON.parse(fs.readFileSync(full, 'utf-8')));

    this.cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, summary });

    return { summary, fresh: true };
  }

  list() {
    const files = fs.readdirSync(this.scenesDir).filter(isSceneFile);
    const summaries = [];
    let changed = false;

    for (const file of files) {
      try {
        const { summary, fresh } = this.summaryOf(file);

        summaries.push(summary);
        changed ||= fresh;
      } catch {}
    }

    for (const file of [...this.cache.keys()]) {
      if (files.includes(file)) continue;

      this.cache.delete(file);
      changed = true;
    }

    if (changed) this.writeCache();

    return summaries.sort(newest);
  }

  get(id) {
    try {
      return JSON.parse(fs.readFileSync(this.filePath(id), 'utf-8'));
    } catch {
      return null;
    }
  }

  save(payload) {
    const id = payload.id || slug(payload.name) || `scene-${Date.now().toString(36)}`;
    const keepTime = payload.keepUpdatedAt && payload.updatedAt;
    const record = {
      id,
      name: payload.name || 'Untitled Robotics Scene',
      globalGoal: payload.globalGoal || '',
      updatedAt: keepTime ? payload.updatedAt : new Date().toISOString(),
      partCount: Array.isArray(payload.parts) ? payload.parts.length : 0,
      thumbnailDataUrl: payload.thumbnailDataUrl,
      previewDataUrl: payload.previewDataUrl,
      sizeMm: payload.sizeMm,
      parts: payload.parts || [],
      annotations: payload.annotations || [],
      project: payload.project,
    };

    this.write(record);

    return summarize(record);
  }

  savePreview({ id, previewDataUrl, sizeMm }) {
    const record = this.get(id);

    if (!record) {
      return null;
    }

    const next = { ...record, previewDataUrl, sizeMm };

    delete next.referenceImages;

    this.write(next);

    return summarize(next);
  }

  delete(id) {
    const file = this.filePath(id);

    if (fs.existsSync(file)) fs.unlinkSync(file);

    return this.list();
  }

  write(record) {
    const file = `${record.id}.json`;
    const full = path.join(this.scenesDir, file);

    fs.writeFileSync(full, JSON.stringify(record), 'utf-8');

    const stat = fs.statSync(full);

    this.cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, summary: summarize(record) });
    this.writeCache();
  }
}
