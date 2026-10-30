#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, here, openStudio, writeShot } from './harness.mjs';
import { readEvents } from './metrics.mjs';
import { replayInStudio } from './replayCore.mjs';
import { stepsFromConversation, stepsFromEvents } from './replaySteps.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => argOption(args, n, d);
const numberOpt = (n) => (opt(n, null) === null ? undefined : Number(opt(n, null)));
const chatFile = opt('chat', null);
const port = Number(opt('port', 5197));
const views = opt('views', 'iso az:-40,el:12 front side').split(/\s+/);

function source() {
  if (chatFile) {
    const conversation = JSON.parse(fs.readFileSync(path.resolve(chatFile), 'utf8'));
    const stopAt = numberOpt('stop-at');
    const out = opt(
      'out',
      path.join(here, 'runs', '_replay', `${conversation.id}${stopAt === undefined ? '' : `-${stopAt}`}`),
    );

    return { steps: stepsFromConversation(conversation, { stopAt }), out };
  }

  const [run, robot] = args;
  const dir = path.join(here, 'runs', run, robot);

  return {
    steps: stepsFromEvents(readEvents(path.join(dir, 'events.jsonl')), { stopAtCall: numberOpt('stop-at-call') }),
    out: opt('out', path.join(dir, 'replay')),
  };
}

const { steps, out } = source();
const startFile = opt('scene', null);

fs.mkdirSync(out, { recursive: true });

const studio = await openStudio({ label: 'replay', port, agent: false, log: () => {} });
const { call } = studio;
const { replayed, scene } = await replayInStudio(studio, steps, {
  startScene: startFile ? JSON.parse(fs.readFileSync(path.resolve(startFile), 'utf8')) : null,
});

fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(scene));

const shots = await call('screenshot', { views });

for (const s of shots.images ?? []) writeShot(path.join(out, `render-${s.view.replace(/[^\w-]+/g, '_')}.png`), s);

for (const [k, set] of (opt('only', '') ? opt('only', '').split(';') : []).entries()) {
  const r = await call('screenshot', { views: [views[0]], ids: set.split(',').filter(Boolean) });

  writeShot(path.join(out, `only-${k}.png`), r.images?.[0]);
}

if (opt('silhouette', null)) {
  const file = opt('silhouette');
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const res = await call('silhouette_compare', {
    reference: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`,
    view: opt('view', 'front'),
  });

  fs.writeFileSync(path.join(out, 'silhouette.json'), JSON.stringify(res, null, 1));
  console.log('silhouette', JSON.stringify(res));
}

const snap = await call('snapshot', {});

fs.writeFileSync(
  path.join(out, 'parts.json'),
  JSON.stringify(
    (snap.parts ?? []).map((p) => ({ id: p.id, kind: p.kind, name: p.name, bounds: p.bounds })),
    null,
    1,
  ),
);

const fit = await call('interference', {});

fs.writeFileSync(path.join(out, 'fit.json'), JSON.stringify(fit, null, 1));
console.log(
  `replayed ${replayed} of ${steps.length} steps → ${out} (${fit.items?.length ?? 0} interferences, ${fit.coplanar?.length ?? 0} coplanar pairs)`,
);

if (args.includes('--keep')) {
  console.log(`app at ${studio.base} (Ctrl-C to stop)`);
  process.on('SIGINT', () => studio.close().then(() => process.exit(0)));
} else {
  await studio.close();
  process.exit(0);
}
