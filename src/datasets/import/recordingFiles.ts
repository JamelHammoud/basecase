import { decoderFor } from './decode';
import { readMcapInto, type McapInput } from './mcapRead';
import { recordingSource } from './recordingEpisode';
import { RecordingReader, type RecordingChannel } from './recordingRead';
import { MCAP_TOO_LARGE } from './decode/limits';
import { readBag1 } from './rosbag1';
import { isBagName } from './sourceKind';
import { DataImportError, IMPORT_LIMITS, type SourceData } from './types';

function readBagInto(reader: RecordingReader, file: McapInput) {
  if (file.bytes.byteLength > IMPORT_LIMITS.fileBytes) throw new DataImportError(MCAP_TOO_LARGE);

  const channels = new Map<number, RecordingChannel>();
  const text = new TextEncoder();

  readBag1(file.bytes, {
    connection: (c) => {
      const schema = { name: c.type, encoding: 'ros1msg', data: text.encode(c.definition) };
      const decode = decoderFor('ros1', schema);

      if (decode) channels.set(c.id, reader.channel(c.topic, c.type, decode));
    },
    message: (m) => {
      const channel = channels.get(m.conn);

      if (channel) reader.message(channel, { path: file.name, logTime: m.ns, data: m.data });
    },
  });
}

export function readRecording(files: McapInput[]): SourceData {
  const reader = new RecordingReader();

  for (const file of files) {
    if (isBagName(file.name)) readBagInto(reader, file);
    else readMcapInto(reader, file);
  }

  return recordingSource(reader.finish());
}

export const readMcap = async (files: McapInput[]): Promise<SourceData> => readRecording(files);
