import {
  HARDWARE_BY_TYPE,
  hardwareDimensions,
  hardwareName,
  HOLES,
  makeSpec,
  type HardwareSpec,
} from '../data/hardware';
import type { ScenePart } from '../types/robotics';
import type { BoardHole, ElectronicsBoard } from './boardTypes';
import { boardRequirement } from './boardConstraints';

const specs = {
  screw: makeSpec('socket_head', { size: 'M3', length: 6 }),
  spacer: makeSpec('standoff_ff', { size: 'M3', length: 10 }),
};

export const isBoardHardware = (part: ScenePart | undefined, kind: keyof typeof specs) =>
  part?.kind === 'hardware' &&
  part.role === 'solid' &&
  hardwareIdentity(part.hardware) === hardwareIdentity(specs[kind]);

const hardwareIdentity = (spec: HardwareSpec | undefined) =>
  JSON.stringify((['type', 'size', 'length', 'finish', 'drive'] as const).map((key) => spec?.[key]));

export function newBoardHole(): BoardHole {
  const id = crypto.randomUUID();

  return {
    id: `mount-${id}`,
    position: [0, 0],
    diameterMm: 3.2,
    keepoutMm: 2,
    mountingParts: { screw: `screw-${id}`, spacer: `spacer-${id}` },
  };
}

function hardwareIds(board: ElectronicsBoard | undefined) {
  return new Map(
    board?.holes
      .flatMap((hole) => Object.entries(hole.mountingParts ?? {}))
      .map(([kind, id]) => [id, kind as keyof typeof specs]),
  );
}

export function reconcileBoardHardware({
  parts,
  before,
  after,
}: {
  parts: ScenePart[];
  before?: ElectronicsBoard;
  after: ElectronicsBoard;
}) {
  const oldIds = hardwareIds(before);
  const nextIds = hardwareIds(after);
  const kept = parts.filter(
    (part) => !oldIds.has(part.id) || nextIds.has(part.id) || !isBoardHardware(part, oldIds.get(part.id)!),
  );
  const known = new Set(parts.map((part) => part.id));
  const added = boardHardware(after).filter((part) => !oldIds.has(part.id) && !known.has(part.id));

  return [...kept, ...added];
}

export function boardHardware(board: ElectronicsBoard): ScenePart[] {
  return board.holes.flatMap((hole) =>
    (['screw', 'spacer'] as const).flatMap((kind) => {
      const id = hole.mountingParts?.[kind];
      const hardware = specs[kind];

      if (!id) return [];

      return [
        {
          id,
          name: hardwareName(hardware),
          kind: 'hardware',
          category: 'hardware',
          role: 'solid',
          hardware: { ...hardware },
          dimensions: hardwareDimensions(hardware),
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          color: HARDWARE_BY_TYPE[hardware.type].color,
          note: '',
          visible: true,
          locked: false,
        },
      ];
    }),
  );
}

export function boardHardwareOffsets(hole: BoardHole, thickness: number) {
  if (!hole.mountingParts) return [];

  return (['screw', 'spacer'] as const).map((kind) => ({
    id: hole.mountingParts![kind],
    kind,
    position: [
      hole.position[0],
      kind === 'screw' ? thickness / 2 - 6 + hardwareDimensions(specs.screw).height / 2 : -thickness / 2 - 5,
      hole.position[1],
    ] as [number, number, number],
  }));
}

function supported(hole: BoardHole, parts: ScenePart[], thickness: number) {
  if (!hole.mountingParts || hole.diameterMm < HOLES.M3.close || hole.diameterMm > HOLES.M3.clearance || thickness > 3)
    return false;

  return (['screw', 'spacer'] as const).every((kind) => {
    const part = parts.find((item) => item.id === hole.mountingParts![kind]);

    return isBoardHardware(part, kind);
  });
}

export function boardHardwareFindings(parts: ScenePart[], board: ElectronicsBoard) {
  const host = parts.find((part) => part.id === board.partId);
  const claimed = new Set<string>();

  return board.holes.flatMap((hole) => {
    const ids = hole.mountingParts ? Object.values(hole.mountingParts) : [];
    const duplicate = ids.some((id) => claimed.has(id));

    ids.forEach((id) => claimed.add(id));

    if (
      host &&
      supported(hole, parts, host.dimensions.height) &&
      !duplicate &&
      ids[0] !== ids[1] &&
      board.heightMm.top >= 3 &&
      board.heightMm.bottom >= 10
    )
      return [];

    return [boardRequirement(board, 'mounting', `${hole.id}: fit the board’s mounting hardware.`)];
  });
}
