import { readDiagnosticArchive } from './diagnosticArtifacts.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ARCHIVE_LIMIT, diagnosticSelection } from './diagnosticContract.mjs';

function write(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;

  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

const rootFor = (context, ticket) => path.join(context.cwd, 'scratch', 'diagnostics', ticket);
const validTicket = (ticket) => /^[a-zA-Z0-9-]{1,80}$/.test(ticket);

function handoff(context, record) {
  const file = path.join(context.cwd, 'scratch', 'task-handoff.json');
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const diagnostics = (previous.diagnostics ?? []).filter((item) => item.ticket !== record.ticket);

  const { ticket, state, selection, url, runId, error, verified } = record;
  const reference = {
    ticket,
    state,
    selection,
    url,
    runId,
    error,
    verified,
    evidence: `scratch/diagnostics/${ticket}/`,
  };

  write(file, { ...previous, diagnostics: [...diagnostics, reference] });
}

export function submitDiagnostic(input, context) {
  if (input?.ticket !== undefined) throw new Error('Diagnostic tickets are assigned by the runner');

  const selection = diagnosticSelection(input);
  const ticket = context.ticket?.() ?? crypto.randomUUID();

  if (!validTicket(ticket)) throw new Error('Malformed diagnostic ticket');

  const root = rootFor(context, ticket);
  const endpoint = `repos/${context.repository}`;
  const request = {
    ticket,
    repository: context.repository,
    selection,
    state: 'preparing',
    submittedAt: new Date().toISOString(),
  };

  fs.mkdirSync(root, { recursive: true });

  if (fs.existsSync(path.join(root, 'request.json'))) throw new Error('Diagnostic ticket already exists');

  write(path.join(root, 'request.json'), request);

  try {
    const commit = context.api(`${endpoint}/commits/${selection.revision}`);

    if (commit.sha !== selection.revision) throw new Error('Published revision does not match');

    const file = context.api(`${endpoint}/contents/${selection.file}?ref=${selection.revision}`);

    if (file.type !== 'file') throw new Error('Selected test is not a published file');

    const workflowRef = context.workflowRef ?? 'main';
    const dispatched = context.api(`${endpoint}/actions/workflows/diagnostic.yml/dispatches`, {
      ref: workflowRef,
      return_run_details: true,
      inputs: { selection: JSON.stringify({ ...selection, ticket }) },
    });

    if (!Number.isSafeInteger(dispatched?.workflow_run_id)) throw new Error('Dispatch returned no durable run ID');

    request.workflowRef = workflowRef;
    request.runId = dispatched.workflow_run_id;
    request.url = dispatched.html_url;
    request.state = 'dispatched';
  } catch (error) {
    request.state = 'failed';
    request.error = error.message;

    throw error;
  } finally {
    write(path.join(root, 'request.json'), request);
    handoff(context, request);
  }

  return request;
}

const minutesOf = (jobs) =>
  jobs.reduce((sum, job) => {
    const elapsed = Date.parse(job.completed_at) - Date.parse(job.started_at);

    return sum + (Number.isFinite(elapsed) ? Math.max(0, elapsed) / 60000 : 0);
  }, 0);

async function retainJobLogs(jobs, request, context) {
  if (!context.log) return [];

  return Promise.all(
    jobs.map(async (job) => {
      try {
        if (!Number.isSafeInteger(job.id)) throw new Error('Malformed job ID');

        const file = `job-${job.id}.log`;
        const log = await context.log(job.id);

        fs.writeFileSync(path.join(rootFor(context, request.ticket), file), Buffer.from(log).subarray(-1024 * 1024));

        return { jobId: job.id, file };
      } catch (error) {
        return { jobId: job.id, error: error.message };
      }
    }),
  );
}

function verifiedManifest(manifest, files, run) {
  const selection = manifest.selection;

  return (
    manifest.version === 1 &&
    manifest.workload?.retries === 0 &&
    manifest.environment?.platform === (selection.platform === 'windows' ? 'win32' : 'linux') &&
    manifest.results.length === selection.runs &&
    manifest.results.every((item) => item.selected === 1) &&
    manifest.results.every(
      (item, index) => files[`run-${index + 1}.json`] !== undefined && files[`run-${index + 1}.log`] !== undefined,
    ) &&
    ['success', 'failure'].includes(run.conclusion)
  );
}

async function retrieve(request, run, context) {
  const endpoint = `repos/${request.repository}/actions/runs/${run.id}`;
  const { jobs } = context.api(`${endpoint}/jobs?per_page=100`);
  const result = {
    ...request,
    state: 'completed',
    url: run.html_url,
    runId: run.id,
    conclusion: run.conclusion,
    jobs,
    ciMinutes: minutesOf(jobs),
    logs: await retainJobLogs(jobs, request, context),
    verified: false,
  };

  write(path.join(rootFor(context, request.ticket), 'result.json'), result);

  const { artifacts } = context.api(`${endpoint}/artifacts?per_page=100`);
  const artifact = artifacts.find((item) => item.name === `diagnostic-${request.ticket}` && !item.expired);

  if (!artifact) return { ...result, error: 'No retained diagnostic artifact' };

  if (artifacts.length > 1 || artifact.size_in_bytes > ARCHIVE_LIMIT)
    throw new Error('Diagnostic artifact limit exceeded');

  const files = readDiagnosticArchive(
    context.download(`repos/${request.repository}/actions/artifacts/${artifact.id}/zip`),
  );
  const manifest = JSON.parse(files['manifest.json']);
  const { ticket, ...selection } = diagnosticSelection(manifest.selection);
  const matches =
    (!ticket || ticket === request.ticket) &&
    JSON.stringify(selection) === JSON.stringify(request.selection) &&
    manifest.revision === request.selection.revision &&
    manifest.workflowRevision === request.workflowRevision;

  if (!matches) throw new Error('Diagnostic evidence does not match the requested revision and selection');

  for (const [name, text] of Object.entries(files))
    fs.writeFileSync(path.join(rootFor(context, request.ticket), name), text);

  return {
    ...result,
    manifest,
    verified: verifiedManifest(manifest, files, run),
  };
}

export function compareDiagnostic(result, baselineId, context) {
  if (!Number.isSafeInteger(baselineId) || baselineId < 1) throw new Error('Select a full Check run ID');

  const endpoint = `repos/${context.repository}/actions/runs/${baselineId}`;
  const baseline = context.api(endpoint);

  if (
    baseline.head_sha !== result.selection.revision ||
    baseline.status !== 'completed' ||
    baseline.path !== '.github/workflows/check.yml' ||
    !['schedule', 'workflow_dispatch'].includes(baseline.event) ||
    baseline.display_title?.startsWith('diagnostic-')
  )
    throw new Error('Comparison requires a completed full Check at the selected workload revision');

  const { jobs } = context.api(`${endpoint}/jobs?per_page=100`);
  const comparison = {
    baselineId,
    baselineUrl: baseline.html_url,
    fullCheckMinutes: minutesOf(jobs),
    diagnosticMinutes: result.ciMinutes,
    additionalSessionStarts: 0,
    note: 'Commands run in the existing repair session. CI minutes are elapsed job minutes, without billing rounding or platform multipliers.',
  };

  write(path.join(rootFor(context, result.ticket), 'comparison.json'), comparison);

  return comparison;
}

function matchesDispatch(run, request) {
  return (
    run?.display_title === `diagnostic-${request.ticket}` &&
    run.path === '.github/workflows/diagnostic.yml' &&
    run.event === 'workflow_dispatch' &&
    /^[a-f0-9]{40}$/.test(run.head_sha ?? '') &&
    (!request.workflowRevision || run.head_sha === request.workflowRevision)
  );
}

export async function collectDiagnostic(ticket, context) {
  if (!validTicket(ticket)) throw new Error('Malformed diagnostic ticket');

  const root = rootFor(context, ticket);
  const request = JSON.parse(fs.readFileSync(path.join(root, 'request.json'), 'utf8'));

  if (request.state !== 'dispatched') throw new Error('Diagnostic was not dispatched');

  if (request.repository !== context.repository) throw new Error('Diagnostic belongs to another repository');

  const run = context.api(`repos/${request.repository}/actions/runs/${request.runId}`);

  if (!matchesDispatch(run, request)) throw new Error('Diagnostic run does not match its dispatch');

  request.workflowRevision = run.head_sha;
  write(path.join(root, 'request.json'), request);

  const reference = { ...request, state: run?.status ?? 'pending', url: run?.html_url, runId: run?.id };

  handoff(context, reference);

  if (!run || run.status !== 'completed') return reference;

  let result;

  try {
    result = await retrieve(request, run, context);
  } catch (error) {
    const saved = path.join(root, 'result.json');
    const metadata = fs.existsSync(saved) ? JSON.parse(fs.readFileSync(saved, 'utf8')) : {};

    result = {
      ...metadata,
      ...reference,
      state: 'completed',
      verified: false,
      conclusion: run.conclusion,
      error: error.message,
    };
  }

  write(path.join(root, 'result.json'), result);
  handoff(context, result);

  return result;
}
