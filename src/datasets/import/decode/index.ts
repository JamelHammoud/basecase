import { decodeJson } from './jsonDecode';
import { DECODE_LIMITS, refused, tooLarge } from './limits';
import { decodeProtobuf } from './protoDecode';
import { parseDescriptorSet } from './protoDescriptor';
import { builtinDefinition } from './rosBuiltins';
import { decodeRos } from './rosDecode';
import { parseRosDefinition, type RosDialect } from './rosDefinition';
import type { ChannelSchema, DecodedMessage, MessageDecoder } from './types';

export type { ChannelSchema, Decoded, DecodedMessage, MessageDecoder } from './types';
export { DECODE_LIMITS, MCAP_TOO_LARGE, SCHEMA_REFUSED } from './limits';

const ROS_SCHEMA_ENCODINGS: Record<string, { schema: string; dialect: RosDialect }> = {
  cdr: { schema: 'ros2msg', dialect: 'cdr' },
  ros1: { schema: 'ros1msg', dialect: 'ros1' },
};

const JSON_SCHEMA_ENCODINGS = new Set(['jsonschema', '']);

const guarded =
  (decode: (bytes: Uint8Array) => DecodedMessage): MessageDecoder =>
  (bytes) => {
    if (bytes.byteLength > DECODE_LIMITS.messageBytes) throw tooLarge();

    return decode(bytes);
  };

function sizeChecked(schema: ChannelSchema | null) {
  if (schema && schema.data.byteLength > DECODE_LIMITS.schemaBytes) throw refused();
}

function rosDecoder(dialect: RosDialect, schema: ChannelSchema): MessageDecoder | null {
  sizeChecked(schema);

  const text =
    schema.data.byteLength > 0 ? new TextDecoder().decode(schema.data) : builtinDefinition(dialect, schema.name);

  if (text === null) return null;

  const parsed = parseRosDefinition(text, schema.name, dialect);

  return guarded((bytes) => decodeRos(parsed, bytes));
}

function protobufDecoder(schema: ChannelSchema): MessageDecoder {
  sizeChecked(schema);

  const parsed = parseDescriptorSet(schema.data);
  const typeName = schema.name.replace(/^\./, '');

  if (!parsed.messages.has(typeName)) throw refused();

  return guarded((bytes) => decodeProtobuf(parsed, typeName, bytes));
}

export function decoderFor(messageEncoding: string, schema: ChannelSchema | null): MessageDecoder | null {
  const ros = Object.hasOwn(ROS_SCHEMA_ENCODINGS, messageEncoding) ? ROS_SCHEMA_ENCODINGS[messageEncoding] : null;

  if (ros && schema?.encoding === ros.schema) return rosDecoder(ros.dialect, schema);

  if (messageEncoding === 'protobuf' && schema?.encoding === 'protobuf') return protobufDecoder(schema);

  const jsonSchema = schema === null || JSON_SCHEMA_ENCODINGS.has(schema.encoding);

  if (messageEncoding !== 'json' || !jsonSchema) return null;

  sizeChecked(schema);

  return guarded(decodeJson);
}
