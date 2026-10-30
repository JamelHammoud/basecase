#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ROBOTS } from './robots.mjs';
import { parseStl } from './geometry.mjs';
import { scoreModels, writeOverlay } from './score.mjs';
import { scoreAgainstDrawing, writeDrawingOverlay } from './drawing.mjs';
import { judgeRun } from './judge.mjs';
import { createEventHandler } from './run-events.mjs';
import { argOption, defaultRunName, here, openStudio, root, sceneRecordOf, writeShot } from './harness.mjs';
import { readEvents, runMetrics } from './metrics.mjs';
import { archiveRun, gitInfo } from './archive.mjs';

const args = process.argv.slice(2);
const robot = args[0];
const port = Number(argOption(args, 'port', 5174));
const runName = argOption(args, 'run', defaultRunName());

if (!ROBOTS[robot]) {
  console.error(`Unknown robot. Choose: ${Object.keys(ROBOTS).join(', ')}`);
  process.exit(1);
}

const out = path.join(here, 'runs', runName, robot);

fs.mkdirSync(out, { recursive: true });

const logFile = fs.createWriteStream(path.join(out, 'events.jsonl'));
const started = Date.now();
const log = (...a) => console.log(`[${robot} ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const studio = await openStudio({
  label: robot,
  port,
  givenApp: argOption(args, 'app', null),
  env: ROBOTS[robot].offline ? { STUDIO_AGENT_OFFLINE: '1' } : {},
  log,
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
const { page, call } = studio;
const counts = { toolCalls: 0, modelPart: 0, failedTools: 0, thoughtChunks: 0, messageChunks: 0 };

studio.onEvent.current = createEventHandler({ counts, log, logFile, started });

const inputsDir = path.join(here, 'data', robot, 'inputs');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const imageDataUrls = (fs.existsSync(inputsDir) ? fs.readdirSync(inputsDir) : [])
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort()
  .map(
    (f) =>
      `data:${MIME[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(path.join(inputsDir, f)).toString('base64')}`,
  );

log(`prompting with ${imageDataUrls.length} photos`);

const result = await studio.post('/api/bridge/acp-prompt', {
  action: 'build',
  promptText: ROBOTS[robot].prompt,
  imageDataUrls,
  imageName: `${robot} photos`,
});
const seconds = Math.round((Date.now() - started) / 1000);

log('agent finished', result.stopReason ?? result.error, `${seconds}s`);

await new Promise((r) => setTimeout(r, 1500));

const parts = await page.evaluate(() => window.__studio.parts());
const stl = Buffer.from(await page.evaluate(() => window.__studio.stlBase64()), 'base64');

fs.writeFileSync(path.join(out, 'agent.stl'), stl);
fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify(parts, null, 1));

const capture = (views, ids) => page.evaluate(([v, i]) => window.__studio.capture(v, i), [views, ids]);
const fileView = (view) => view.replace(/[^\w-]+/g, '_');

for (const s of await capture(['iso', 'front', 'side', 'az:-40,el:12']))
  writeShot(path.join(out, `render-${fileView(s.view)}.png`), s);

const snapForGroups = await call('snapshot');
const boundsById = new Map((snapForGroups.parts ?? []).map((p) => [p.id, p.bounds]));
const groups = {};

for (const p of parts.filter((x) => x.group && x.kind !== 'hardware')) {
  groups[p.group] ??= [];
  groups[p.group].push(p.id);
}

const extent = (ids) => {
  const bs = ids.map((id) => boundsById.get(id)).filter(Boolean);

  if (!bs.length) return 0;

  return Math.max(...[0, 1, 2].map((k) => Math.max(...bs.map((b) => b.max[k])) - Math.min(...bs.map((b) => b.min[k]))));
};

for (const [g, ids] of Object.entries(groups)
  .sort((a, b) => extent(b[1]) - extent(a[1]))
  .slice(0, 2)) {
  const [shot] = await capture(['az:-35,el:20'], ids);

  writeShot(path.join(out, `render-detail-${g.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`), shot);
}

async function renderInternals() {
  const shells = /shell|cover|hood|housing|skin|panel|visor|fairing|bumper|lid|cap|case/i;
  const inner = parts
    .filter((p) => p.visible && p.role === 'solid' && !shells.test(`${p.id} ${p.name}`))
    .map((p) => p.id);

  if (!inner.length) return;

  const [shot] = await capture(['iso'], inner);

  writeShot(path.join(out, 'render-internals-iso.png'), shot);
}

if (ROBOTS[robot].concept) await renderInternals();

const scene = await sceneRecordOf(page);

if (ROBOTS[robot].build) {
  for (const [kind, file] of [
    ['bom', 'build-bom.txt'],
    ['printability', 'build-print.txt'],
    ['verify', 'build-verify.txt'],
  ]) {
    try {
      fs.writeFileSync(path.join(out, file), (await call(kind))?.text ?? '');
    } catch (err) {
      fs.writeFileSync(path.join(out, file), `failed: ${err}`);
    }
  }
}

const { interferences: interference, coplanar } = await page.evaluate(() => window.__studio.interference());
const finished = new Set(['cad_part', 'component', 'hardware', 'image_plane']);

const summary = {
  robot,
  seconds,
  stopReason: result.stopReason,
  ...counts,
  parts: parts.length,
  cadParts: parts.filter((p) => p.kind === 'cad_part').length,
  catalogParts: parts.filter((p) => p.kind === 'component' || p.kind === 'hardware').length,
  primitives: parts.filter((p) => p.role === 'solid' && !finished.has(p.kind)).length,
  interferences: interference.length,
  worstInterferenceMm: interference[0]?.depthMm ?? 0,
  coplanar: coplanar.length,
};
const refFile = path.join(here, 'data', robot, 'reference.stl');

if (fs.existsSync(refFile) && stl.length > 84) {
  const refMeta = JSON.parse(fs.readFileSync(path.join(here, 'data', robot, 'reference.json'), 'utf8'));
  const solidParts = parts.filter((p) => p.role === 'solid' && p.visible).length;
  const s = scoreModels(parseStl(fs.readFileSync(refFile)), parseStl(stl), {
    agentParts: solidParts,
    refParts: refMeta.parts,
    allOrientations: !!ROBOTS[robot].allOrientations,
  });

  summary.placedCatalogParts = ROBOTS[robot].modelItYourself
    ? parts.filter((p) => p.kind === 'component').length
    : undefined;

  writeOverlay(path.join(out, 'overlay.png'), s.views);

  const { views, ...score } = s;

  void views;
  summary.score = score;
}

const drawing = ROBOTS[robot].frontDrawing && path.join(here, 'data', robot, ROBOTS[robot].frontDrawing);

if (drawing && stl.length > 84) {
  const d = scoreAgainstDrawing(parseStl(stl), drawing);

  writeDrawingOverlay(path.join(out, 'drawing-overlay.png'), d.view);

  const { view, ...rest } = d;

  void view;
  summary.drawing = rest;
}

if (!args.includes('--no-judge') && stl.length > 84) {
  try {
    summary.judge = await judgeRun(out, robot);
  } catch (err) {
    log('judge failed', err.message);
  }
}

studio.onEvent.current = null;
await new Promise((r) => logFile.end(r));
summary.metrics = runMetrics(readEvents(path.join(out, 'events.jsonl')), { result, seconds });

archiveRun({
  runsDir: path.join(here, 'runs'),
  run: runName,
  task: robot,
  kind: 'robot',
  dir: out,
  summary,
  scene,
  git: gitInfo(root),
});
log('summary', JSON.stringify({ ...summary, metrics: { ...summary.metrics, toolsByName: undefined } }));

await studio.close();
process.exit(0);
