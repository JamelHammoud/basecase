import { MAX_ROOM_BYTES, readRoomPlan, type Room } from '../cases/roomPlan';
import { CaseFileError } from '../cases/validate';

export async function readRoomFile(file: File): Promise<Room> {
  if (file.size > MAX_ROOM_BYTES) throw new CaseFileError(`${file.name} is too big for a room`);

  return readRoomPlan(await file.text(), file.name);
}
