import { reply } from '../utils/workerRpc';
import { StudyVisibilitySession, type VisibilityLoad } from './visibilitySession';
import { StudyWireReader, type StudyPacket } from './wire';

export function createVisibilityHandlers() {
  const session = new StudyVisibilitySession();
  const reader = new StudyWireReader();

  return {
    load: async (input: VisibilityLoad) => reply(await session.load(input)),
    measure: async (packet: StudyPacket) => reply(await session.measure(reader.read(packet))),
    close: (_input: null) => reply(session.dispose()),
  };
}

export type VisibilityHandlers = ReturnType<typeof createVisibilityHandlers>;
