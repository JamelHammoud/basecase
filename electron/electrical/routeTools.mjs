import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { boardExecutable, boardProcess } from './process.mjs';

export const ROUTER_VERSION = '2.1.0';
export const ROUTER_HASH = '2c07d58f75dac03782664081e7a58b41c25400d871a9fcf166a2ea6fe60d5def';
export const ROUTER_JAVA_VERSION = '21.0.13';

export async function routeTools() {
  const directory = process.env.BASECASE_ROUTING_TOOLS;

  if (!directory) throw new Error('board-router');

  const java = path.join(directory, 'runtime', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const jar = path.join(directory, `freerouting-${ROUTER_VERSION}.jar`);
  const python = await boardPython();

  try {
    const stat = await fs.stat(jar);

    if (!stat.isFile() || stat.size > 70 * 1024 * 1024) throw new Error('board-router');

    const digest = createHash('sha256')
      .update(await fs.readFile(jar))
      .digest('hex');

    if (digest !== ROUTER_HASH) throw new Error('board-router');

    await fs.access(java);

    return { java, jar, python };
  } catch {
    throw new Error('board-router');
  }
}

async function boardPython() {
  if (process.env.BASECASE_KICAD_PYTHON) return process.env.BASECASE_KICAD_PYTHON;

  if (process.platform === 'linux') return '/usr/bin/python3';

  const cli = await boardExecutable();
  const candidates = [path.join(path.dirname(cli), 'python.exe')];

  if (process.platform === 'darwin')
    candidates.unshift(path.resolve(path.dirname(cli), '../Frameworks/Python.framework/Versions/3.9/bin/python3.9'));

  for (const file of candidates) {
    try {
      await fs.access(file);

      return file;
    } catch {
      continue;
    }
  }

  throw new Error('board-router');
}

export async function verifyRoutingRuntime(tools, options) {
  const output = await boardProcess({ command: tools.java, args: ['-version'], ...options });

  if (!output.includes(`openjdk version "${ROUTER_JAVA_VERSION}"`) || !output.includes('Temurin-21.0.13+9'))
    throw new Error('board-router');
}

export async function routeToolStatus(_input, options = {}) {
  try {
    const tools = await routeTools();

    await fs.access(tools.python);

    if (process.env.BASECASE_KICAD_DOCKER !== '1') await boardExecutable();

    await verifyRoutingRuntime(tools, { cwd: options.temporaryRoot, signal: options.signal });

    return { issues: [] };
  } catch {
    return { issues: ['board-router'] };
  }
}
