import { isRoomFileName, MAX_ROOM_BYTES, readRoomPlan, type Room } from './roomPlan';
import { CaseFileError } from './validate';
import { readWorldSource } from './worldImport';
import { checkWorldSizes, worldRefuse } from './worldRead';
import type { DroppedFile, WorldSource } from './worldTypes';

export type DroppedWorld = { kind: 'room'; room: Room } | { kind: 'world'; world: WorldSource };

function readRoom(file: DroppedFile): Room {
  if (file.bytes.byteLength > MAX_ROOM_BYTES) worldRefuse(`${file.name} is too big for a room`);

  try {
    return readRoomPlan(new TextDecoder().decode(file.bytes), file.name);
  } catch (error) {
    if (error instanceof CaseFileError) throw error;

    throw new CaseFileError('Couldn’t read these files.');
  }
}

export async function readWorldFiles(files: DroppedFile[]): Promise<DroppedWorld> {
  const rooms = files.filter((f) => isRoomFileName(f.name));

  if (!rooms.length || rooms.length < files.length) return { kind: 'world', world: await readWorldSource(files) };

  checkWorldSizes(files.map((f) => ({ name: f.name, byteLength: f.bytes.byteLength })));

  if (rooms.length > 1) worldRefuse('Drop one room at a time.');

  return { kind: 'room', room: readRoom(rooms[0]) };
}
