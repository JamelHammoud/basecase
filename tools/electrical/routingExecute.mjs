import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardProcess, boardExecutable } from '../../electron/electrical/process.mjs';

export function routingExecute(options) {
  const converter = fileURLToPath(new URL('../../electron/electrical/routeConvert.py', import.meta.url));

  const copperCheck = fileURLToPath(new URL('./copperCheck.py', import.meta.url));

  if (process.env.BASECASE_KICAD_DOCKER !== '1' || ![converter, copperCheck].includes(options.args[0]))
    return boardProcess(options);

  const source = path.resolve(path.dirname(converter), '../..');

  return boardProcess({
    ...options,
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--network',
      'none',
      '--memory',
      '768m',
      '--cpus',
      '2',
      '--pids-limit',
      '128',
      '--user',
      '0:0',
      '--volume',
      `${options.cwd}:/work`,
      '--volume',
      `${source}:/source:ro`,
      '--workdir',
      '/work',
      '--entrypoint',
      'python3',
      'kicad/kicad:9.0.6',
      `/source/${path.relative(source, options.args[0]).split(path.sep).join('/')}`,
      ...options.args.slice(1),
    ],
  });
}

export async function nativeElectricalCli(args, cwd, signal) {
  if (process.env.BASECASE_KICAD_DOCKER !== '1')
    return boardProcess({ command: await boardExecutable(), args, cwd, signal });

  return boardProcess({
    command: 'docker',
    args: [
      'run',
      '--rm',
      '--network',
      'none',
      '--memory',
      '768m',
      '--cpus',
      '2',
      '--pids-limit',
      '128',
      '--user',
      '0:0',
      '--volume',
      `${cwd}:/work`,
      '--workdir',
      '/work',
      '--entrypoint',
      'kicad-cli',
      'kicad/kicad:9.0.6',
      ...args,
    ],
    cwd,
    signal,
  });
}
