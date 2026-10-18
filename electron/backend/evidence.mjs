import fs from 'node:fs';
import path from 'node:path';

const MAX_LISTED_FILES = 400;

const KIND_LABELS = {
  image: ['image', 'images'],
  text: ['text file', 'text files'],
  'mesh summary': ['mesh summary', 'mesh summaries'],
};

const folderId = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');

const safeRelativePath = (relPath) =>
  String(relPath || 'file')
    .split(/[\\/]+/)
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .map((seg) => seg.replace(/[^\w .()+@-]/g, '_').slice(0, 120))
    .join('/');

export function evidenceKind(filePath) {
  if (/\.(png|jpe?g|webp|gif)$/i.test(filePath)) return 'image';

  if (/\.mesh\.txt$/i.test(filePath)) return 'mesh summary';

  return 'text';
}

function writeFolderRecord(root, { id, folderName }) {
  const recordPath = path.join(root, '.folder.json');

  if (fs.existsSync(recordPath)) return;

  fs.writeFileSync(recordPath, JSON.stringify({ id, name: folderName || id, createdAt: new Date().toISOString() }));
}

export function saveEvidenceFile(evidenceDir, { folderId: rawId, folderName, relPath, dataUrl, text }) {
  const id = folderId(rawId);

  if (!id) throw new Error('Missing evidence folder id');

  const root = path.join(evidenceDir, id);
  const rel = safeRelativePath(relPath);
  const target = path.join(root, rel);

  if (!target.startsWith(root + path.sep)) throw new Error('Bad evidence path');

  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeFolderRecord(root, { id, folderName });

  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl || '');

  if (m) fs.writeFileSync(target, Buffer.from(m[2], 'base64'));
  else fs.writeFileSync(target, String(text ?? ''), 'utf-8');

  return { ok: true, path: `${id}/${rel}` };
}

function walkFiles(root, id) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) walk(full);
      else
        files.push({
          path: `${id}/${path.relative(root, full).split(path.sep).join('/')}`,
          bytes: fs.statSync(full).size,
        });
    }
  };

  walk(root);

  return files;
}

function folderName(root, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.folder.json'), 'utf-8')).name || id;
  } catch {
    return id;
  }
}

export function listEvidenceFiles(evidenceDir, rawId) {
  const id = folderId(rawId);
  const root = path.join(evidenceDir, id);

  if (!id || !fs.existsSync(root)) return null;

  const files = walkFiles(root, id);

  return { id, name: folderName(root, id), files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

function kindSummary(files) {
  const counts = {};

  for (const f of files) counts[evidenceKind(f.path)] = (counts[evidenceKind(f.path)] || 0) + 1;

  return Object.entries(counts)
    .map(([k, n]) => `${n} ${KIND_LABELS[k][n > 1 ? 1 : 0]}`)
    .join(', ');
}

export function describeEvidenceFolder(evidenceDir, rawId) {
  const folder = listEvidenceFiles(evidenceDir, rawId);

  if (!folder) return null;

  const shown = folder.files.slice(0, MAX_LISTED_FILES);
  const hidden = folder.files.length - shown.length;

  return [
    `Evidence folder "${folder.name}" (${kindSummary(folder.files)}):`,
    ...shown.map((f) => `- ${f.path} (${evidenceKind(f.path)}, ${Math.max(1, Math.round(f.bytes / 1024))} KB)`),
    ...(hidden > 0 ? [`- …and ${hidden} more (list_evidence shows all)`] : []),
  ].join('\n');
}
