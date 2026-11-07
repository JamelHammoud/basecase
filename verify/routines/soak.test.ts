import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileRoutine, greetingRoutine } from '../../src/routines/testing';
import { repoPath } from '../lib/need';

const SECONDS = 75;
const HANG_SECONDS = 60;
const MAX_P999_US = 2000;
const CONTROL_HZ = 50;
const COORDINATOR_HZ = 20;
const BINARY = repoPath('hw', 'target', 'release', process.platform === 'win32' ? 'routine-soak.exe' : 'routine-soak');

interface SoakReport {
  plan_hash: string;
  bus: string;
  seconds: number;
  workers: number;
  control: { ticks: number; p50_us: number; p99_us: number; p999_us: number; max_us: number; tripped: boolean };
  body_skills: Record<string, number>;
  coordinator: { ticks: number };
  hung: { node: string; started_ms: number | null; answered: boolean };
}

function runSoak(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(BINARY, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

const lastJson = (text: string): SoakReport => JSON.parse(text.trim().split('\n').pop() ?? '{}');

describe('fake-bus soak: coordinator, saturated workers and a hung LLM node', () => {
  it(`keeps control jitter p99.9 under ${MAX_P999_US / 1000} ms for ${SECONDS} s`, async () => {
    if (!fs.existsSync(BINARY)) throw new Error(`Not built: ${path.relative(repoPath(), BINARY)} is missing.`);

    const compiled = compileRoutine(greetingRoutine());

    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-soak-'));
    const planFile = path.join(dir, 'plan.json');
    const workers = os.availableParallelism();

    fs.writeFileSync(planFile, JSON.stringify(compiled.plan));

    const args = ['--plan', planFile, '--seconds', String(SECONDS), '--workers', String(workers)];
    const r = await runSoak([...args, '--hang', 'ask', '--hang-seconds', String(HANG_SECONDS)]);
    const loadAfter = os.loadavg()[0];

    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.code, r.stderr).toBe(0);

    const report = lastJson(r.stdout);
    const ticks = report.control.ticks;

    expect(report.plan_hash).toBe(compiled.plan.hash);
    expect(report.bus).toBe('emulated');
    expect(report.seconds).toBe(SECONDS);
    expect(report.workers).toBeGreaterThanOrEqual(workers);
    expect(process.platform === 'win32' || loadAfter >= workers * 0.5, `load ${loadAfter}`).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(SECONDS * CONTROL_HZ * 0.98);
    expect(report.coordinator.ticks).toBeGreaterThanOrEqual(SECONDS * COORDINATOR_HZ * 0.98);
    expect(report.control.tripped).toBe(false);
    expect(report.body_skills.walk ?? 0).toBeGreaterThanOrEqual(ticks * 0.95);
    expect(report.hung.node).toBe('ask');
    expect(report.hung.started_ms).not.toBeNull();
    expect(report.hung.started_ms ?? Infinity).toBeLessThanOrEqual((SECONDS - HANG_SECONDS) * 1000);
    expect(report.hung.answered).toBe(false);
    expect(report.control.p999_us, JSON.stringify(report.control)).toBeLessThan(MAX_P999_US);
  });
});
