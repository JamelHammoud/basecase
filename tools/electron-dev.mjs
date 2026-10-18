#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const APP_NAME = 'Basecase';
const BUNDLE_ID = 'app.basecase.dev';
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const electronVersion = require('electron/package.json').version;

const ICON_DIR = path.resolve('build', 'icon', 'compiled');
const ICON_FILES = ['Assets.car', `${APP_NAME}.icns`];

function bundleStamp() {
  const icon = ICON_FILES.map((f) => {
    const p = path.join(ICON_DIR, f);

    return fs.existsSync(p) ? `${f}:${fs.statSync(p).size}:${fs.statSync(p).mtimeMs}` : `${f}:none`;
  });

  return [electronVersion, ...icon].join('\n');
}

function ensureDevBundle() {
  const source = path.resolve(electronBinary, '..', '..', '..');
  const root = path.resolve('node_modules', '.cache', 'basecase-electron');
  const bundle = path.join(root, `${APP_NAME}.app`);
  const executable = path.join(bundle, 'Contents', 'MacOS', APP_NAME);
  const stamp = path.join(root, 'electron-version');
  const stampOk = fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === bundleStamp();

  if (stampOk && fs.existsSync(executable)) return executable;

  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });

  try {
    execFileSync('cp', ['-cR', source, bundle]);
  } catch {
    execFileSync('ditto', [source, bundle]);
  }

  fs.renameSync(path.join(bundle, 'Contents', 'MacOS', 'Electron'), executable);

  const plist = path.join(bundle, 'Contents', 'Info.plist');
  const set = (key, value) => execFileSync('plutil', ['-replace', key, '-string', value, plist]);

  set('CFBundleExecutable', APP_NAME);
  set('CFBundleName', APP_NAME);
  set('CFBundleDisplayName', APP_NAME);
  set('CFBundleIdentifier', BUNDLE_ID);

  if (ICON_FILES.every((f) => fs.existsSync(path.join(ICON_DIR, f)))) {
    for (const f of ICON_FILES) fs.copyFileSync(path.join(ICON_DIR, f), path.join(bundle, 'Contents', 'Resources', f));

    set('CFBundleIconFile', APP_NAME);
    set('CFBundleIconName', APP_NAME);
  }

  try {
    execFileSync(LSREGISTER, ['-f', bundle]);
  } catch {}

  fs.writeFileSync(stamp, bundleStamp());
  console.log(`[electron-dev] Built ${path.relative(process.cwd(), bundle)} from Electron ${electronVersion}`);

  return executable;
}

let binary = electronBinary;

if (process.platform === 'darwin') {
  try {
    binary = ensureDevBundle();
  } catch (err) {
    console.warn(`[electron-dev] Couldn't build ${APP_NAME}.app, using Electron.app:`, err.message);
  }
}

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
