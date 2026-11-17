import { boardHoles } from './boardHoles';
import {
  boardDigest,
  boardEvidenceKey,
  boardProject,
  BOARD_CLI_VERSION,
  connectedBoardReport,
} from './boardNativeContract.mjs';
import { reconcileRoutedBoard } from './boardReconcile.mjs';
import { boardImportMessage } from './boardRoutingFindings';
import { electricalSourceJson } from './electricalSource';
import type { BoardNativeRequest, BoardNativeResult, BoardRoutedSource } from './boardRoutingTypes';

export interface PreparedBoardExport {
  files: Record<string, string>;
  sourceFingerprint: string;
  request: BoardNativeRequest | null;
}

export async function retainBoardSource(options: {
  routed: BoardRoutedSource | undefined;
  files: Record<string, string>;
  sourceFingerprint: string;
}) {
  const { routed, files, sourceFingerprint } = options;

  if (!routed) return;

  const report = JSON.parse(files['requirements.json']);
  const issue = await sourceIssue(routed, files['robot.kicad_pcb'], sourceFingerprint);

  files['current-unrouted.kicad_pcb'] = files['robot.kicad_pcb'] ?? '';
  files['robot.kicad_pcb'] = routed.pcb;
  files['robot.kicad_pro'] = boardProject(routed.rules);
  files[`source/${routed.hash}.kicad_pcb`] = routed.pcb;
  files['README.txt'] =
    'Editable routed board. Read requirements.json and placement.json before connecting hardware.\nFabrication files require current KiCad 9.0.6 validation and explicit manufacturing inputs.\nDRC doesn’t establish current capacity, thermal performance or measured electrical behavior. Checks in Basecase remains the build verdict.\n';
  report.board.routed = {
    hash: routed.hash,
    sourceFingerprint: routed.sourceFingerprint,
    rules: routed.rules,
    provenance: routed.provenance,
  };

  if (issue)
    report.board.requirements.push({
      code: issue,
      partIds: [report.board.board.partId],
      references: [],
      detail: boardImportMessage(issue),
    });

  files['requirements.json'] = electricalSourceJson(report, 2);
}

async function sourceIssue(routed: BoardRoutedSource, expected: string | undefined, sourceFingerprint: string) {
  if (routed.hash !== (await boardDigest(routed.pcb))) return 'board-format';

  if (!expected || routed.sourceFingerprint !== sourceFingerprint) return 'board-stale-routing';

  const compared = reconcileRoutedBoard({ expected, imported: routed.pcb, sourceFingerprint });

  return compared.accepted ? null : compared.code;
}

export async function nativeBoardRequest(
  prepared: { files: Record<string, string>; sourceFingerprint: string },
  routed: BoardRoutedSource | undefined,
) {
  if (!routed) return null;

  const expected = prepared.files['current-unrouted.kicad_pcb'];

  if (await sourceIssue(routed, expected, prepared.sourceFingerprint)) return null;

  const report = JSON.parse(prepared.files['requirements.json']);
  const source = JSON.parse(prepared.files['source.json']);
  const mechanicalIssues = report.board.requirements
    .map((item: { code: string }) => item.code)
    .filter((code: string) => !['board-unrouted', 'board-unmapped'].includes(code))
    .sort();

  const request: BoardNativeRequest = {
    id: crypto.randomUUID(),
    expected,
    pcb: routed.pcb,
    schematic: prepared.files['robot.kicad_sch'],
    footprints: Object.fromEntries(
      Object.entries(prepared.files)
        .filter(([name]) => /^Robot\.pretty\/[A-Za-z0-9_.-]+\.kicad_mod$/u.test(name))
        .map(([name, text]) => [name.slice(13), text]),
    ),
    boardHash: routed.hash,
    sourceFingerprint: prepared.sourceFingerprint,
    geometryFingerprint: await boardDigest(electricalSourceJson(source.boardGeometry)),
    rules: routed.rules,
    mechanicalIssues,
    copperExclusions: boardExclusions(report.board.board),
  };

  request.key = await boardEvidenceKey(request);

  return request;
}

export async function finishBoardFiles(prepared: PreparedBoardExport, result: BoardNativeResult | null) {
  const files = { ...prepared.files };
  const { request } = prepared;

  if (!request || !result) return withBoardManifest(files, prepared);

  if (result.key !== (await boardEvidenceKey(request))) throw new Error(boardImportMessage('board-stale-routing'));

  const report = JSON.parse(files['requirements.json']);
  const validation = { key: result.key, version: result.version, issues: result.issues, report: result.report };

  report.validator = {
    name: 'kicad-cli',
    version: result.version,
    status: result.issues.length ? 'unresolved' : 'passed',
    key: result.key,
  };
  report.board.requirements = report.board.requirements.filter(
    (item: { code: string }) => item.code !== 'board-unrouted' || !connectedBoardReport(result),
  );
  report.board.requirements.push(
    ...result.issues
      .filter((code) => !report.board.requirements.some((item: { code: string }) => item.code === code))
      .map((code) => ({
        code,
        partIds: [report.board.board.partId],
        references: [],
        detail: boardImportMessage(code),
      })),
  );
  files['requirements.json'] = electricalSourceJson(report, 2);
  files['validation.json'] = electricalSourceJson(validation, 2);

  if (!result.issues.length && result.version === BOARD_CLI_VERSION) Object.assign(files, result.files);

  return withBoardManifest(files, prepared, result);
}

async function withBoardManifest(
  files: Record<string, string>,
  prepared: PreparedBoardExport,
  result?: BoardNativeResult,
) {
  const source = JSON.parse(files['source.json']);
  const request = prepared.request;
  const hashes = Object.fromEntries(
    await Promise.all(Object.entries(files).map(async ([name, text]) => [name, await boardDigest(text)])),
  );

  files['manifest.json'] = electricalSourceJson(
    {
      schema: 1,
      sourceFingerprint: prepared.sourceFingerprint,
      boardHash: request?.boardHash ?? (await boardDigest(files['robot.kicad_pcb'])),
      geometryFingerprint:
        request?.geometryFingerprint ?? (await boardDigest(electricalSourceJson(source.boardGeometry))),
      validationKey: result?.key,
      fabricationRules: request?.rules,
      hashes,
    },
    2,
  );

  return files;
}

function boardExclusions(board: import('./boardTypes').ElectronicsBoard) {
  return [
    ...board.keepouts.map(({ min, max }) => ({ min, max })),
    ...boardHoles(board).map((hole) => {
      const radius = hole.diameterMm / 2 + hole.keepoutMm;

      return {
        min: [hole.position[0] - radius, hole.position[1] - radius] as [number, number],
        max: [hole.position[0] + radius, hole.position[1] + radius] as [number, number],
      };
    }),
  ];
}
