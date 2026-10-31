import fs from 'node:fs';
import path from 'node:path';
import builder from 'electron-builder';
import { runtimeEntries, runtimeSpec } from '../../electron/backend/agentRuntimes.mjs';

const KINDS = ['claude', 'codex', 'gemini'];

function appDir(context) {
  if (context.electronPlatformName !== 'darwin') return path.join(context.appOutDir, 'resources', 'app');

  return path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app');
}

export default async function afterPack(context) {
  const platform = `${context.electronPlatformName}-${builder.Arch[context.arch]}`;
  const app = appDir(context);
  const lock = JSON.parse(fs.readFileSync(path.join(context.packager.projectDir, 'package-lock.json'), 'utf8'));
  const entries = runtimeEntries(lock, [platform]);
  const missing = KINDS.map((kind) => runtimeSpec(kind, platform).pkg).filter((pkg) => !entries[pkg]);
  const shipped = KINDS.map((kind) => runtimeSpec(kind, platform).pkg).filter((pkg) =>
    fs.existsSync(path.join(app, 'node_modules', pkg)),
  );

  if (missing.length) throw new Error(`package-lock.json has no ${missing.join(', ')} for ${platform}`);

  if (shipped.length) throw new Error(`${shipped.join(', ')} got packaged; agents download them on first use`);

  fs.writeFileSync(path.join(app, 'electron', 'backend', 'agent-runtimes.json'), JSON.stringify(entries, null, 2));
}
