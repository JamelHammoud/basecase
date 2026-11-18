import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { routeTools } from '../../electron/electrical/routeTools.mjs';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { routeNativeBoard } from '../../electron/electrical/route.mjs';
import { runNativeBoard } from '../../electron/electrical/validate.mjs';
import { routingFaults } from './routingFaults.mjs';
import { checkRoutedArtifacts } from './routedCheck.mjs';
import { expectedPads } from './boardCheck.mjs';
import { readKiCadBoard, kiCadChildren, kiCadChild } from '../../src/wiring/boardKiCad.mjs';
import { routingExecute, nativeElectricalCli } from './routingExecute.mjs';

if (process.argv.includes('--docker')) process.env.BASECASE_KICAD_DOCKER = '1';

const output = path.resolve('scratch/electrical/routing');

await fs.mkdir(output, { recursive: true });
await build({
  input: 'tools/electrical/routeFixtures.ts',
  platform: 'node',
  transform: { define: { 'import.meta.env.MODE': '"production"', 'import.meta.env.BASE_URL': '"/"' } },
  plugins: [
    {
      name: 'native-routing-assets',
      resolveId: (id) => (id === 'manifold-3d/manifold.wasm?url' ? path.resolve('tools/cli/assetUrl.mjs') : null),
    },
  ],
  output: { file: path.join(output, 'fixtures.mjs'), format: 'esm', codeSplitting: false },
});

const { routingFixtures, acceptBoardRoute, finishBoardExport, encodeSceneFile, decodeSceneFile, nativeKitFixture } =
  await import(pathToFileURL(path.join(output, 'fixtures.mjs')).href);
const results = [];
const tools = await routeTools();

const fixtures = await routingFixtures();

await routingExecute({ command: tools.python, args: [path.resolve('tools/electrical/copperCheck.py')], cwd: output });

for (const fixture of fixtures) {
  const original = JSON.stringify(fixture.input.project);
  const pins = expectedPads({ expected: fixture.expected, board: fixture.base });

  try {
    const input = await fixture.prepare();

    process.stdout.write(
      `${JSON.stringify({ name: fixture.name, issues: input.request.mechanicalIssues, pads: input.request.pcb.match(/thru_hole/g)?.length })}\n`,
    );

    const routed = await routeNativeBoard(input, {
      cli: process.env.BASECASE_KICAD_DOCKER === '1' ? nativeElectricalCli : undefined,
      execute: async (options) => {
        const outputText = await routingExecute(options);

        if (options.args[1] === 'dsn')
          await fs.copyFile(path.join(options.cwd, 'robot.dsn'), path.join(output, `${fixture.name}.dsn`));

        if (options.args.includes('-jar')) {
          await fs.copyFile(path.join(options.cwd, 'robot.ses'), path.join(output, `${fixture.name}.ses`));

          const passes = [...outputText.matchAll(/Auto-router pass #(\d+)/gu)].map((match) => Number(match[1]));

          assert.ok(passes.length > 0 && Math.max(...passes) <= 8);
        }

        return outputText;
      },
    });
    const parsed = readKiCadBoard(routed.pcb);
    const actual = kiCadChildren(parsed, 'footprint')
      .flatMap((footprint) => {
        const reference = kiCadChildren(footprint, 'property').find((field) => field[1] === 'Reference')?.[2];

        return kiCadChildren(footprint, 'pad')
          .filter((pad) => pad[1] !== '')
          .map((pad) => ({ reference, pad: pad[1], net: kiCadChild(pad, 'net')[2] }));
      })
      .sort((a, b) => a.reference.localeCompare(b.reference) || a.pad.localeCompare(b.pad));

    assert.deepEqual(actual, pins);
    assert.equal(fixture.expectedOutcome, 'routed');

    const { board, prepared } = await fixture.finish(routed.pcb, routed.provenance);
    const validation = await runNativeBoard(prepared.request, { cli: nativeElectricalCli });

    assert.deepEqual(validation.issues, [], `${fixture.name}: ${validation.report}`);

    if (fixture.name === 'dual-bus-arm') {
      await fs.writeFile(
        path.join(output, 'faults.json'),
        JSON.stringify(await routingFaults({ request: prepared.request, input }), null, 2),
      );
    }

    const accepted = await acceptBoardRoute({ board, request: prepared.request, result: validation });
    const archive = await finishBoardExport({ prepared, result: validation });

    if (fixture.name === 'dual-bus-arm') {
      const repeated = await runNativeBoard(prepared.request, { cli: nativeElectricalCli });

      assert.deepEqual(repeated.files, validation.files);
      assert.equal(repeated.report, validation.report);
      await checkRoutedArtifacts(
        {
          prepared,
          finish: (result) => finishBoardExport({ prepared, result }),
          kit: (result) =>
            nativeKitFixture(
              { ...fixture.input, project: { ...fixture.input.project, electronicsBoard: accepted } },
              prepared,
              result,
            ),
        },
        validation,
      );
    }

    const saved = await encodeSceneFile({
      parts: fixture.input.parts,
      project: { ...fixture.input.project, electronicsBoard: accepted },
      name: fixture.name,
      globalGoal: '',
      annotations: [],
    });
    const reopened = await decodeSceneFile(saved);

    assert.deepEqual(reopened.project.electronicsBoard, accepted);
    assert.equal(Object.keys(validation.files).length, 10);
    await fs.writeFile(path.join(output, `${fixture.name}.zip`), archive.bytes);
    results.push({
      name: fixture.name,
      status: 'routed',
      metrics: routed.metrics,
      native: validation.metrics,
      bytes: archive.bytes.length,
      tracks: kiCadChildren(parsed, 'segment').length,
      vias: kiCadChildren(parsed, 'via').length,
    });
  } catch (error) {
    if (fixture.expectedOutcome !== 'refused') throw new Error(`${fixture.name}: ${error.message}`, { cause: error });

    assert.equal(error.message, 'board-route-layout');
    results.push({ name: fixture.name, status: 'refused', reason: error.message });
  }

  assert.equal(JSON.stringify(fixture.input.project), original);
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  process.stdout.write(`${JSON.stringify(results.at(-1))}\n`);
}

assert.equal(results.length, 10);

assert.equal(results.filter((result) => result.status === 'routed').length, 2);
