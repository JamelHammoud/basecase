import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const release = path.join(root, 'hw', 'target', 'release');
const out = path.join(root, 'hw', 'dist');
const DAEMON = process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon';
const staged = path.join(out, DAEMON);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(release, DAEMON), staged);

if (process.platform === 'darwin') execFileSync('codesign', ['--force', '--sign', '-', staged]);

console.log(`Staged the robot daemon in ${path.relative(root, out)}: ${fs.readdirSync(out).join(', ')}`);
