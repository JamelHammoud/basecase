import fs from 'node:fs';
import path from 'node:path';
import { fetchJson, finding, root } from './run.mjs';

const NODE_INDEX = 'https://nodejs.org/dist/index.json';
const NODE_SCHEDULE = 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';
const ELECTRON_REGISTRY = 'https://registry.npmjs.org/electron';
const ELECTRON_SUPPORTED_MAJORS = 3;

const parts = (version) => String(version).replace(/^v/, '').split('.').map(Number);
const majorOf = (version) => parts(version)[0];

function newer(a, b) {
  const [x, y] = [parts(a), parts(b)];
  const i = x.findIndex((n, k) => n !== y[k]);

  return i !== -1 && x[i] > y[i];
}

function readText(file) {
  const full = path.join(root, file);

  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

function isEol(schedule, major, today) {
  const end = schedule[`v${major}`]?.end;

  return end ? end < today : true;
}

function nodeRuntimeFindings({ index, schedule, ltsMajor, today }) {
  const local = process.versions.node;
  const major = majorOf(local);
  const security = index.filter((r) => majorOf(r.version) === major && r.security && newer(r.version, local));
  const latestSameMajor = index.find((r) => majorOf(r.version) === major)?.version;
  const findings = [];

  if (isEol(schedule, major, today)) {
    findings.push(finding('critical', `Node ${local} is end of life`, '', `Install Node ${ltsMajor} (LTS)`));
  }

  if (security.length > 0) {
    const versions = security.map((r) => r.version).join(', ');

    findings.push(
      finding('high', `Node ${local} is missing security releases`, versions, `Install ${latestSameMajor}`),
    );
  }

  if (major < ltsMajor) {
    findings.push(finding('moderate', `Node ${local} is older than the active LTS`, '', `Move to Node ${ltsMajor}`));
  }

  return findings;
}

function pinnedNodeVersions() {
  const pins = [];
  const nvmrc = readText('.nvmrc');
  const engines = JSON.parse(readText('package.json')).engines?.node;

  if (nvmrc) pins.push({ where: '.nvmrc', version: nvmrc.trim() });

  if (engines) pins.push({ where: 'package.json engines.node', version: engines.replace(/^[^\d]*/, '') });

  const workflows = path.join(root, '.github', 'workflows');
  const files = fs.existsSync(workflows) ? fs.readdirSync(workflows) : [];

  for (const file of files) {
    const text = fs.readFileSync(path.join(workflows, file), 'utf8');

    for (const match of text.matchAll(/node-version:\s*['"]?([\w.]+)/g)) {
      pins.push({ where: `.github/workflows/${file}`, version: match[1] });
    }
  }

  return pins;
}

function pinFindings({ schedule, ltsMajor, today }) {
  const pins = pinnedNodeVersions();
  const findings = pins
    .filter((pin) => /^\d/.test(pin.version))
    .flatMap((pin) => {
      const major = majorOf(pin.version);

      if (isEol(schedule, major, today)) {
        return [finding('high', `${pin.where} pins Node ${pin.version}, which is end of life`, '', `Pin ${ltsMajor}`)];
      }

      return major < ltsMajor
        ? [finding('moderate', `${pin.where} pins Node ${pin.version}`, `Active LTS is ${ltsMajor}`, `Pin ${ltsMajor}`)]
        : [];
    });

  if (!pins.some((pin) => pin.where === '.nvmrc')) {
    findings.push(
      finding('low', 'No .nvmrc', 'Contributors and CI can drift to old Node', `Add .nvmrc with ${ltsMajor}`),
    );
  }

  return findings;
}

export async function nodeToolchain() {
  try {
    const [index, schedule] = await Promise.all([fetchJson(NODE_INDEX), fetchJson(NODE_SCHEDULE)]);
    const ltsMajor = majorOf(index.find((r) => r.lts).version);
    const context = { index, schedule, ltsMajor, today: new Date().toISOString().slice(0, 10) };

    return { name: 'Node', findings: [...nodeRuntimeFindings(context), ...pinFindings(context)] };
  } catch (err) {
    return { name: 'Node', error: String(err.message ?? err) };
  }
}

function electronFinding(installed, tags) {
  const major = majorOf(installed);
  const latestMajor = majorOf(tags.latest);
  const latestPatch = tags[`${major}-x-y`];

  if (major <= latestMajor - ELECTRON_SUPPORTED_MAJORS) {
    return finding(
      'critical',
      `Electron ${installed} is out of support`,
      `Only the latest ${ELECTRON_SUPPORTED_MAJORS} majors get security fixes (latest ${tags.latest})`,
      `npm install -D electron@${tags.latest}`,
    );
  }

  if (latestPatch && newer(latestPatch, installed)) {
    return finding(
      'high',
      `Electron ${installed} is behind ${latestPatch}`,
      'Patch releases carry Chromium security fixes',
      `npm install -D electron@${latestPatch}`,
    );
  }

  return major < latestMajor
    ? finding('low', `Electron ${installed}`, `Latest is ${tags.latest}`, `npm install -D electron@${tags.latest}`)
    : null;
}

export async function electronToolchain() {
  try {
    const installed = JSON.parse(readText('node_modules/electron/package.json')).version;
    const registry = await fetchJson(ELECTRON_REGISTRY);
    const result = electronFinding(installed, registry['dist-tags']);

    return { name: 'Electron', findings: result ? [result] : [] };
  } catch (err) {
    return { name: 'Electron', error: String(err.message ?? err) };
  }
}
