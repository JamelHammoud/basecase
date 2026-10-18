#!/usr/bin/env node
/**
 * Models components that have no manufacturer CAD with the studio's own agent (Claude Code over
 * ACP, the same path as the Agent panel), from the official drawings and the part's record.
 *
 *   node tools/parts/generate.mjs <id…> [--port 5381]
 *
 * For each id it reads tools/parts/specs/<id>/ (record.json + drawing images), attaches them
 * as evidence, asks the agent for an exact replica, then saves:
 *   - public/parts/<id>.glb (+ its size in src/data/component-meshes.json), from the agent's parts
 *   - tools/parts/generated/<id>/: the part code, renders and the agent's final notes for review
 *
 * Like bench/run.mjs it runs on a snapshot of the app with its own dev server and headless
 * Chrome, so it never touches the app you have open or your library.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { writePartGlb } from './glb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
// A random high port by default: a stale browser tab left on a familiar port (5174, 5181…)
// would reconnect to this server and answer the agent's scene requests with its own scene
const port = Number(opt('port', 0)) || 5300 + Math.floor(Math.random() * 600);
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
if (ids.length === 0) {
  console.error('Usage: node tools/parts/generate.mjs <id…> [--port 5381]');
  process.exit(1);
}
const base = `http://127.0.0.1:${port}`;
const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);

/** How each kind of part should sit, in the agent's frame (Z up, front −Y) */
const POSE = {
  servo: 'Case bottom on the floor (z = 0), output shaft pointing up (+Z), long side along X, output shaft on the +X half.',
  motor: 'Mounting face up: body on the floor (z = 0), output shaft pointing up (+Z).',
  board: 'PCB flat on the floor (bottom face at z = 0), component side up, long side along X.',
  camera: 'Upright as it is normally mounted: base on the floor (z = 0), lenses facing the front (−Y), long side along X.',
  gripper: 'Mounting flange on the floor (z = 0), fingers pointing up (+Z), jaws closing along X, at the open position.',
  hand: 'Wrist mount on the floor (z = 0), fingers pointing up (+Z), palm facing the front (−Y), fingers straight (open hand).',
  lidar: 'Mounting face on the floor (z = 0), scan plane horizontal, cable or connector toward the back (+Y).',
};

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve({ error: text.slice(0, 500) });
        }
      });
    });
    req.setTimeout(0);
    req.on('error', reject);
    req.end(data);
  });
}

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      if (err?.fatal) throw err;
    }
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

// 1. Snapshot + dev server on its own port
const app = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-parts-'));
for (const f of ['src', 'electron', 'vendor', 'public', 'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
  if (fs.existsSync(path.join(root, f))) fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true });
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir');
const vite = spawn(process.execPath, [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: app,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const cleanup = () => {
  try {
    vite.kill();
  } catch {
    /* gone */
  }
  fs.rmSync(app, { recursive: true, force: true });
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
let viteOut = '';
let viteExited = false;
vite.on('exit', () => (viteExited = true));
vite.stdout.on('data', (d) => (viteOut += d));
vite.stderr.on('data', (d) => (viteOut += d));
await waitFor(async () => {
  if (viteExited) throw Object.assign(new Error(`Port ${port} is taken or vite failed:\n${viteOut.slice(-400)}`), { fatal: true });
  return /ready in|Local:/.test(viteOut) && (await fetch(base)).ok;
}, 60000, 'dev server');
log('dev server up');

// 2. Headless app (it answers the agent's CAD-tool requests)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => log('page error', e.message));
await page.goto(base);
await waitFor(() => page.evaluate(() => !!window.__studio), 180000, 'app');
await waitFor(async () => (await (await fetch(`${base}/api/bridge/acp-status`)).json()).connected, 90000, 'agent connection');
log('agent connected');

// The agent's reply text, from the same event stream the app uses
let replyText = '';
const sse = http.get(`${base}/api/events`, (res) => {
  res.setEncoding('utf8');
  let buf = '';
  res.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
      buf = buf.slice(i + 2);
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        const u = ev.update;
        if (ev.type === 'acp-session-update' && u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') replyText += u.content.text;
        // A tool call between text chunks starts a new paragraph; keep only the last one
        else if (ev.type === 'acp-session-update' && u?.sessionUpdate === 'tool_call') replyText = '';
      } catch {
        /* partial or non-JSON event */
      }
    }
  });
});
sse.setTimeout(0);
sse.on('error', () => {});

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

for (const id of ids) {
  const specDir = path.join(here, 'specs', id);
  const recordFile = path.join(specDir, 'record.json');
  if (!fs.existsSync(recordFile)) {
    log(`${id}: no ${path.relative(root, recordFile)}`);
    continue;
  }
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  const out = path.join(here, 'generated', id);
  fs.mkdirSync(out, { recursive: true });
  const t0 = Date.now();

  // Fresh scene and conversation for each part
  await page.evaluate(() => window.__studio.clear());
  await postJson(`${base}/api/bridge/acp-new-conversation`, {});

  // Evidence: the record and every drawing image
  const folderId = `part-${id}-${Date.now().toString(36)}`;
  const save = (relPath, payload) => postJson(`${base}/api/bridge/save-evidence-file`, { folderId, folderName: `${record.name} specs`, relPath, ...payload });
  await save('record.json', { text: JSON.stringify(record, null, 1) });
  const images = fs.readdirSync(specDir).filter((f) => MIME[path.extname(f).toLowerCase()]);
  for (const f of images) {
    await save(f, { dataUrl: `data:${MIME[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(path.join(specDir, f)).toString('base64')}` });
  }

  const pose = POSE[record.pose] ?? POSE.board;
  const promptText = [
    `Model the ${record.name} (${record.manufacturer} ${record.mpn}) as an exact replica for a parts library. People will design mounts, pockets and brackets around it, so every dimension must match the manufacturer's numbers.`,
    '',
    `- Use only the official numbers in record.json and the attached drawings (${images.length} images). Read all of them first. Don't take sizes from sellers or community models.`,
    '- Model what fits and mates: overall envelope, mounting holes and tabs at their exact positions and diameters, output shaft or spline (outer diameter and height), horn interface, connectors and lenses at their stated positions.',
    '- Where the official sources give no number for a feature, keep that feature plain and conservative, and list it under "Not dimensioned" in your final message. Never invent precise-looking detail.',
    `- Pose: ${pose}`,
    '- One part per separate physical body (case, horn, PCB, header, connector), each with model_part, in realistic colors (e.g. case #1d1d1f, PCB #1f5f3a or the board\'s real color, metal #c8c8cc).',
    '- No cables, leads or plugs (they bend, and their exit points are rarely dimensioned). No guides, cutouts or labels. Finish with check_scene and look, and compare the bounding box with the record envelope.',
    '',
    'Final message: a short table of the key dimensions you modeled and their sources, then "Not dimensioned".',
  ].join('\n');

  log(`${id}: prompting with ${images.length} images`);
  const result = await postJson(`${base}/api/bridge/acp-prompt`, { action: 'build', promptText, evidenceFolders: [{ id: folderId }] });
  log(`${id}: agent finished (${result.stopReason ?? result.error}) in ${Math.round((Date.now() - t0) / 1000)}s`);

  replyText = '';
  // Verification round: measure every official number on the model, not just the envelope
  const review = await postJson(`${base}/api/bridge/acp-prompt`, {
    action: 'build',
    promptText: [
      'Verify the model against the official numbers before we save it.',
      '',
      '1. get_scene, then make a table with one row per dimension and feature in record.json (envelope, each protrusion such as a spline, boss, shaft or pilot, tab heights and hole positions, connector positions): official value · value measured on your model (from part positions and sizes: e.g. a spline\'s top must sit exactly its protrusion above the face it stands on) · OK or wrong.',
      '2. Check every part sits where it belongs: protrusions start at the face they come out of, nothing that should be outside is buried inside another part, nothing floats.',
      '3. Fix every wrong row (update_parts or model_part), then look and check_scene again.',
      '',
      'Final message: the table after fixes, then "Not dimensioned".',
    ].join('\n'),
  });
  log(`${id}: verified (${review.stopReason ?? review.error}) in ${Math.round((Date.now() - t0) / 1000)}s total`);
  await new Promise((r) => setTimeout(r, 1500));

  // 3. Collect the model
  const byColor = await page.evaluate(() => window.__studio.meshByColor());
  const groups = Object.entries(byColor).map(([hex, soup]) => ({
    color: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
    soup,
  }));
  if (groups.length === 0) {
    log(`${id}: the agent produced no solid parts`);
    continue;
  }
  const stat = writePartGlb(id, groups, { source: 'agent', triangleBudget: 80000 });
  log(`${id}: ${stat.size.join(' × ')} mm · ${stat.triangles} tris · ${stat.colors} colors`);

  const sources = await page.evaluate(() => window.__studio.cadSources());
  fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify(sources, null, 1));
  const shots = await page.evaluate(() => window.__studio.capture(['iso', 'front', 'side', 'top']));
  for (const s of shots) fs.writeFileSync(path.join(out, `render-${s.view}.png`), Buffer.from(s.dataUrl.split(',')[1], 'base64'));
  const finalText = replyText.trim();
  fs.writeFileSync(
    path.join(out, 'notes.md'),
    `# ${record.name}\n\nModeled by the studio agent on ${new Date().toISOString().slice(0, 10)} from the official drawings in tools/parts/specs/${id}/.\n\nEnvelope: ${stat.size.join(' × ')} mm (studio frame, Y up).\n\n${finalText}\n`
  );
}

sse.destroy();
await browser.close();
cleanup();
process.exit(0);
