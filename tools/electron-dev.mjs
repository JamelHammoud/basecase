#!/usr/bin/env node
/**
 * Runs the app in Electron, named Basecase.
 *
 *   node tools/electron-dev.mjs .        (what `npm run electron` and `npm run electron:dev` run)
 *
 * In dev, macOS names an app after its bundle, not app.setName(): the menu bar, Dock, ⌘Tab and
 * Force Quit all said "Electron". Editing Electron.app's Info.plist isn't enough, because every
 * Electron app on the Mac shares its bundle id (com.github.Electron) and its executable name.
 * So on macOS this keeps an APFS clone of the dev Electron.app as Basecase.app (no extra disk
 * space) with its own bundle id and executable, rebuilt when Electron's version changes, and
 * launches that. Elsewhere it runs the stock Electron binary.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const APP_NAME = 'Basecase';
const BUNDLE_ID = 'app.basecase.dev';
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

const require = createRequire(import.meta.url);
// The electron package's main export is the path to its binary
const electronBinary = require('electron');
const electronVersion = require('electron/package.json').version;

function ensureDevBundle() {
  const source = path.resolve(electronBinary, '..', '..', '..'); // …/Electron.app
  const root = path.resolve('node_modules', '.cache', 'basecase-electron');
  const bundle = path.join(root, `${APP_NAME}.app`);
  const executable = path.join(bundle, 'Contents', 'MacOS', APP_NAME);
  const stamp = path.join(root, 'electron-version');
  const stampOk = fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === electronVersion;
  if (stampOk && fs.existsSync(executable)) return executable;

  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  try {
    // -c clones on APFS: instant, and shares the original's blocks
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
  try {
    execFileSync(LSREGISTER, ['-f', bundle]);
  } catch {
    // Launch Services picks the bundle up on first launch anyway
  }
  fs.writeFileSync(stamp, electronVersion);
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
