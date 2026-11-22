import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { openBenchPage, serveStatic } from './benchPage.mjs';
import { loadWorkflowFixtures } from './loadWorkflowFixtures.mjs';
import { distribution } from './workflowProbes.mjs';
import { workflowInteractions, orbitDuringWork } from './workflowInteractions.mjs';
import { workflowCpu } from './workflowTrace.mjs';
import { workflowMemory } from './workflowMemory.mjs';
import { workflowBudgets } from './workflowBudgets.mjs';

function textureBytes() {
  const data = new Uint8Array(1024 * 1024 * 3);
  let state = 1959;

  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = state >>> 24;
  }

  return sharp(data, { raw: { width: 1024, height: 1024, channels: 3 } })
    .png()
    .toBuffer();
}

async function request(page, backend, event, record) {
  const reply = page.waitForRequest(
    (req) => req.url().endsWith('/agent-respond') && req.postDataJSON().requestId === event.requestId,
  );

  const started = await page.evaluate(
    (payload) => {
      const at = performance.now();

      window.__workflowEmit(payload);

      return at;
    },
    {
      type: 'agent-request',
      workspaceId: backend.workspace(),
      ...event,
    },
  );

  const response = await reply;
  const answer = response.postDataJSON();

  record({ requestId: event.requestId, kind: event.kind, started });

  if (answer.error) throw new Error(answer.error);

  return answer.result;
}

async function checkpoint(page) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Search commands').fill('Scene History');
  await page.keyboard.press('Enter');
  await page.getByLabel('Version name').fill('During agent edits');
  await page.getByRole('button', { name: 'Save Version', exact: true }).click();
  await page.getByRole('button', { name: 'During agent edits', exact: true }).waitFor();
  await page
    .getByRole('dialog', { name: 'Scene history', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
}

async function editDuringStream(page, workload, send) {
  const operations = (async () => {
    for (const job of workload.requests) await send(job);

    return send({ kind: 'readiness', payload: {} });
  })();

  await Promise.all([operations, workflowInteractions(page)]);
}

async function promptWorkload(page) {
  await page.waitForFunction(() => Boolean(window.__studio));
  await page.getByRole('tab', { name: 'Agent', exact: true }).first().click();
  await page.locator('textarea:not([inert] *):visible').last().fill('Adjust this robot');

  const prompted = page.waitForRequest((req) => req.url().endsWith('/acp-prompt'));

  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await prompted;
}

async function caseVerdicts(page, saved) {
  const cases = saved.project?.cases ?? [];

  if (!cases.length) return [];

  await page.getByRole('tab', { name: 'Build', exact: true }).first().click();

  return Promise.all(
    cases.map(async ({ id }) => {
      const row = page.locator(`#case-check-${id}:visible`);

      await row.waitFor();

      const text = await row.textContent();
      const status = await row.getAttribute('data-status');

      if (!/of 20$/.test(text) || status === 'not run') throw new Error(`Case ${id} has no completed verdict: ${text}`);

      return { id, text, status };
    }),
  );
}

function workloadMetrics({
  workload,
  app,
  headless,
  renderer,
  trace,
  completionMs,
  navigationToDurableMs,
  durable,
  reopened,
  observations,
  heaps,
  cases,
  processMemory,
  requestTimings,
}) {
  const timings = requestTimings.map((entry) => ({
    ...entry,
    completed: observations.replies.find((reply) => reply.requestId === entry.requestId)?.at ?? null,
  }));

  if (timings.some((entry) => entry.completed === null || entry.completed < entry.started))
    throw new Error('The workflow reply probe did not record valid renderer timestamps.');

  return {
    workload: workload.name,
    browserVersion: app.browser.version(),
    headless,
    renderer,
    cpu: workflowCpu(trace),
    parts: workload.scene.parts.length,
    completionMs,
    navigationToDurableMs,
    durable,
    reopened,
    checksFresh: true,
    caseVerdicts: cases,
    inputToPaint: distribution(observations.inputs.map((entry) => entry.ms)),
    longTasks: distribution(observations.long.map((entry) => entry.ms)),
    frameGaps: distribution(observations.frames.map((entry) => entry.ms)),
    workerRoundTrip: distribution(observations.workers.map((entry) => entry.ms)),
    workerSend: distribution(observations.workers.map((entry) => entry.sendMs)),
    cancelledWorkerJobs: observations.cancelled,
    sampledPeakHeapAndBackingBytes: Math.max(0, ...heaps),
    processMemory,
    requestTimings: timings,
    interactionsDuringRequests: Object.fromEntries(
      ['orbit', 'select', 'edit'].map((kind) => [
        kind,
        observations.inputs.some(
          (input) =>
            input.kind === kind &&
            timings.some(
              (request) =>
                request.completed !== null && request.started <= input.at && input.paint <= request.completed,
            ),
        ),
      ]),
    ),
    observations,
    errors: app.errors,
  };
}

function memorySampler(cdp, memory) {
  const heaps = [];
  const sample = () =>
    Promise.all([
      memory.sample(),
      cdp
        .send('Runtime.getHeapUsage')
        .then((value) => heaps.push(value.usedSize + value.backingStorageSize))
        .catch(() => {}),
    ]);

  return {
    sample,
    startSampling: () => setInterval(() => void sample(), 100),
    async finishSampling(timer) {
      clearInterval(timer);
      await sample();

      return { heaps: [...heaps], processMemory: memory.summary() };
    },
  };
}

async function storeTrace({ app, cdp, profile, workload, output }) {
  const trace = await app.browser.stopTracing();
  const traceDir = `${output}.traces`;

  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${workload.name}.json`), trace);

  if (profile === workload.name) {
    const measured = await cdp.send('Profiler.stop');

    const profileDir = `${output}.profiles`;

    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, `${workload.name}.cpuprofile`), JSON.stringify(measured.profile));
  }

  return trace;
}

async function measureWorkload({
  server,
  workload,
  workflowBackend,
  verifyAgentWorkload,
  gpu,
  profile,
  output,
  headless,
}) {
  const app = await openBenchPage({
    url: server.url,
    scene: workload.scene,
    gpu,
    headless,
    setup: (page) => workflowBackend(page, workload.scene),
  });
  const backend = app.prepared;
  const page = app.page;
  const navigationOrigin = await page.evaluate(() => performance.timeOrigin);
  let sampler = null;
  let stopOrbit = null;
  const memory = await workflowMemory(app.browser);

  try {
    console.log(JSON.stringify({ workload: workload.name, phase: 'composer' }));
    await promptWorkload(page);
    console.log(JSON.stringify({ workload: workload.name, phase: 'prompted' }));

    const cdp = await page.context().newCDPSession(page);

    if (profile === workload.name) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }

    const { sample, startSampling, finishSampling } = memorySampler(cdp, memory);

    await sample();
    sampler = startSampling();

    const renderer = await page.evaluate(() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');

      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
    });

    const categories = ['toplevel', '__metadata'];

    if (profile === workload.name) categories.push('devtools.timeline', 'v8.execute');

    await app.browser.startTracing(page, { categories });

    stopOrbit = await orbitDuringWork(page);

    const start = await page.evaluate(() => performance.now());
    const started = Date.now();
    let sequence = 0;
    const requestTimings = [];
    const send = (job) =>
      request(page, backend, { ...job, requestId: `workflow-${++sequence}` }, (entry) => requestTimings.push(entry));

    console.log(JSON.stringify({ workload: workload.name, phase: 'stream' }));
    await editDuringStream(page, workload, send);
    console.log(JSON.stringify({ workload: workload.name, phase: 'checked' }));

    if (workload.checkpoint) await checkpoint(page);

    const checked = await send({ kind: 'readiness', payload: {} });

    if (!/^(READY TO BUILD|NOT READY)/.test(checked.text) || checked.text.includes('nothing here is measured'))
      throw new Error(`Final Checks did not publish a verdict: ${checked.text}`);

    const finished = page.waitForRequest((req) => req.url().endsWith('/acp-forget-run'));

    backend.finish();
    await finished;

    const completionMs = Date.now() - started;
    const navigationToDurableMs = Date.now() - navigationOrigin;

    const sampling = sampler;
    const orbit = stopOrbit;

    sampler = null;
    stopOrbit = null;

    const [resources] = await Promise.all([finishSampling(sampling), orbit()]);

    console.log(JSON.stringify({ workload: workload.name, phase: 'durable' }));

    const trace = await storeTrace({ app, cdp, profile, workload, output });

    const observations = await page.evaluate(
      (from) => ({
        long: window.__workflow.long.filter((entry) => entry.at >= from),
        frames: window.__workflow.frames.filter((entry) => entry.at >= from),
        workers: window.__workflow.workers.filter((entry) => entry.at >= from),
        cancelled: window.__workflow.cancelled.filter((entry) => entry.at >= from),
        inputs: window.__workflow.inputs.filter((entry) => entry.at >= from),
        replies: window.__workflow.replies.filter((entry) => entry.at >= from),
      }),
      start,
    );
    const saved = backend.reopen();
    const durable = verifyAgentWorkload(workload, saved);
    const records = `${output}.records`;

    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(path.join(records, `${workload.name}.json`), JSON.stringify(saved));

    if (!durable) throw new Error(`Accepted edits missing after reopening ${workload.name}`);

    const cases = await caseVerdicts(page, saved);

    await page.reload();
    await page.waitForFunction(() => Boolean(window.__studio));

    const reopened = await page.evaluate(
      () => window.__studio.sceneRecord().parts.find((part) => part.id === 'control')?.position[0] === 37,
    );

    return workloadMetrics({
      workload,
      app,
      headless,
      renderer,
      trace,
      completionMs,
      navigationToDurableMs,
      durable,
      reopened,
      observations,
      cases,
      ...resources,
      requestTimings,
    });
  } catch (error) {
    console.log(JSON.stringify({ workload: workload.name, error: String(error) }));

    throw error;
  } finally {
    clearInterval(sampler);

    if (stopOrbit) await stopOrbit().catch(() => {});

    backend.finish();
    await memory.close();
    await app.browser.close();
    backend.close();
  }
}

async function recordWorkload(options, rows, output) {
  const row = await measureWorkload({ ...options, output });

  rows.push(row);
  fs.writeFileSync(output, JSON.stringify(rows, null, 2));
  console.log(
    JSON.stringify({
      output,
      ...row,
      observations: undefined,
      processMemory: { ...row.processMemory, samples: undefined },
    }),
  );
}

export async function runAgentWorkflow({
  dist,
  gpu,
  only,
  output,
  fixtureFile,
  profile,
  baseline,
  baselineDist,
  headless = true,
}) {
  const { agentWorkloads, workflowBackend, verifyAgentWorkload } = await loadWorkflowFixtures();
  const texture = `data:image/png;base64,${(await textureBytes()).toString('base64')}`;
  const generated =
    fixtureFile && fs.existsSync(fixtureFile)
      ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8'))
      : agentWorkloads(texture);

  if (fixtureFile && !fs.existsSync(fixtureFile)) fs.writeFileSync(fixtureFile, JSON.stringify(generated));

  const workloads = generated.filter((workload) => !only?.length || only.includes(workload.name));
  const server = await serveStatic(path.resolve(dist));
  const reference = baselineDist ? await serveStatic(path.resolve(baselineDist)) : null;
  const rows = [];
  const references = [];

  try {
    for (const [index, workload] of workloads.entries()) {
      const options = { workload, workflowBackend, verifyAgentWorkload, gpu, headless, profile };
      const arms = [{ server, rows, output }];

      if (reference) arms.unshift({ server: reference, rows: references, output: `${output}.baseline.json` });

      if (index % 2) arms.reverse();

      for (const arm of arms) await recordWorkload({ ...options, server: arm.server }, arm.rows, arm.output);
    }
  } finally {
    server.close();
    reference?.close();
  }

  const previous = baseline ? JSON.parse(fs.readFileSync(baseline, 'utf8')) : references;
  const compared = workflowBudgets(rows, previous);

  fs.writeFileSync(`${output}.budgets.json`, JSON.stringify(compared, null, 2));

  return rows;
}
