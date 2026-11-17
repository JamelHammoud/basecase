import { routingInput } from './boardRoutingRecord';
import { BoxGeometry, ExtrudeGeometry, Matrix4, Path, Shape } from 'three';
import { collide, place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { partMatrix } from '../utils/kinematicsMotion';
import { electricalSourceJson } from './electricalSource';
import { boardRequirement } from './boardConstraints';
import { placedArea } from './boardCoordinates';
import { boardProduct } from './boardProducts';
import type { ElectricalInput, ElectricalRequirement } from './electricalTypes';
import type { BoardKeepout, ElectronicsBoard } from './boardTypes';
import type { ScenePart } from '../types/robotics';
import { hashText } from '../utils/geometryHash';
import { validBoardDefinition, validBoardPart } from './boardValidation';
import type { Interference } from '../three/interference';
import { boardDrills, boardHoleFindings } from './boardHoles';
import { boardModuleId } from './boardMounts';

export interface BoardGeometry {
  key: string;
  triangles: Record<string, Float32Array>;
}

export function boardGeometryKey(input: ElectricalInput) {
  const board = routingInput(input).project.electronicsBoard;

  return hashText(
    electricalSourceJson({ board: { ...board, fabrication: undefined, routing: undefined }, parts: input.parts }),
  );
}

export function boardSolid(part: ScenePart, board: ElectronicsBoard) {
  const findings = boardHoleFindings(board, part);

  if (findings.length) throw new Error(findings[0].detail);

  const { width, depth, height } = part.dimensions;
  const shape = new Shape();

  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();

  for (const hole of boardDrills(board)) {
    const path = new Path();

    path.absarc(hole.position[0], hole.position[1], hole.diameterMm / 2, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }

  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 16 });

  geometry.rotateX(Math.PI / 2).translate(0, height / 2, 0);

  const solid = solidFromPositions(new Float32Array(geometry.getAttribute('position').array));

  geometry.dispose();

  return solid;
}

function envelope(area: BoardKeepout, range: [number, number], frame: Matrix4) {
  const size = [area.max[0] - area.min[0], range[1] - range[0], area.max[1] - area.min[1]];
  const geometry = new BoxGeometry(...(size as [number, number, number])).toNonIndexed();
  const solid = solidFromPositions(new Float32Array(geometry.getAttribute('position').array));
  const matrix = frame
    .clone()
    .multiply(
      new Matrix4().makeTranslation(
        (area.min[0] + area.max[0]) / 2,
        (range[0] + range[1]) / 2,
        (area.min[1] + area.max[1]) / 2,
      ),
    );

  geometry.dispose();

  return place(`board-envelope:${area.id}`, solid, matrix);
}

function boardVolumes(part: ScenePart, board: ElectronicsBoard) {
  const frame = partMatrix(part);
  const volumes = [place(part.id, boardSolid(part, board), frame)];
  const surface = part.dimensions.height / 2;

  for (const item of board.placements) {
    const product = boardProduct(item.productId);

    if (!product) continue;

    const top: [number, number] = [surface, surface + product.access.heightMm];
    const range: [number, number] = board.side === 'top' ? top : [-top[1], -top[0]];
    const lower: [number, number] = [-surface - product.belowMm, -surface];
    const pins: [number, number] = board.side === 'top' ? lower : [-lower[1], -lower[0]];

    volumes.push(envelope({ ...placedArea(item, product.access, board.side), id: `${item.id}:plug` }, range, frame));
    volumes.push(envelope({ ...placedArea(item, product.courtyard, board.side), id: `${item.id}:pins` }, pins, frame));
  }

  return volumes;
}

const validTriangles = (array: Float32Array | undefined): array is Float32Array =>
  array instanceof Float32Array && array.length >= 36 && array.length % 9 === 0 && array.every(Number.isFinite);

function obstacles(input: ElectricalInput, geometry: BoardGeometry, board: ElectronicsBoard) {
  const placed: Placed[] = [];
  const requirements: ElectricalRequirement[] = [];
  let count = 0;

  for (const part of input.parts) {
    if (part.id === board.partId || part.role !== 'solid') continue;

    const positions = geometry.triangles[part.id];

    count += positions?.length ?? 0;

    if (!validTriangles(positions) || count > 9_000_000) {
      requirements.push(
        boardRequirement(board, 'geometry', `${part.name}: prepare complete geometry for board clearance.`),
      );

      continue;
    }

    placed.push(place(part.id, solidFromPositions(positions), partMatrix(part)));
  }

  return { placed, requirements };
}

function collisionRequirements(board: ElectronicsBoard, hits: Interference[], volumeIds: Set<string>) {
  const seen = new Set<string>();

  return hits.flatMap((hit) => {
    const ids = [...new Set([board.partId, ...[hit.a, hit.b].filter((id) => !volumeIds.has(id))])].sort();
    const key = JSON.stringify(ids);

    if (seen.has(key)) return [];

    seen.add(key);

    return [
      { ...boardRequirement(board, 'collision', 'Move the board or leave room for its connectors.'), partIds: ids },
    ];
  });
}

export function analyzeBoardGeometry(input: ElectricalInput, geometry: BoardGeometry) {
  const board = input.project.electronicsBoard;
  const part = input.parts.find((candidate) => candidate.id === board?.partId);

  if (!board || !part) throw new Error('Board definition is required.');

  if (!validBoardDefinition(board)) throw new Error('Repair the board definition before placement.');

  if (!validBoardPart(part))
    return { requirements: [boardRequirement(board, 'geometry', 'Restore the board’s rectangular solid.')] };

  if (geometry.key !== boardGeometryKey(input))
    return {
      requirements: [
        boardRequirement(board, 'stale-geometry', 'Measure board clearance again after the scene changes.'),
      ],
    };

  const holes = boardHoleFindings(board, part);

  if (holes.length) return { requirements: holes };

  const scene = obstacles(input, geometry, board);
  const volumes = boardVolumes(part, board);
  const volumeIds = new Set(volumes.map((volume) => volume.id));
  const owners = new Map(
    board.placements.flatMap((placement) => {
      const owner = boardModuleId(input.parts, placement);

      return owner
        ? [
            [`board-envelope:${placement.id}:plug`, owner],
            [`board-envelope:${placement.id}:pins`, owner],
          ]
        : [];
    }),
  );

  try {
    const result = collide(
      [...volumes, ...scene.placed],
      {
        toleranceMm: 0.05,
        maxSamples: 1000,
        focus: volumes.map((volume) => volume.id),
        coplanar: false,
      },
      (a, b) => (volumeIds.has(a) && volumeIds.has(b)) || owners.get(a) === b || owners.get(b) === a,
    );

    return {
      requirements: [...scene.requirements, ...collisionRequirements(board, result.interferences, volumeIds)],
    };
  } finally {
    [...volumes, ...scene.placed].forEach((volume) => volume.solid.dispose());
  }
}
