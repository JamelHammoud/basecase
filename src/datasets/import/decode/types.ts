import type { DecodedMessage } from '../../../topics/topicLog';

export type { Decoded, DecodedMessage } from '../../../topics/topicLog';

export interface ChannelSchema {
  name: string;
  encoding: string;
  data: Uint8Array;
}

export type MessageDecoder = (bytes: Uint8Array) => DecodedMessage;
