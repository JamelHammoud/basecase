const NEWLINE = 0x0a;
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

export function encodeReply(header, glb = new Uint8Array(0)) {
  const head = utf8.encode(JSON.stringify(header));
  const bytes = new Uint8Array(head.length + 1 + glb.length);

  bytes.set(head, 0);
  bytes[head.length] = NEWLINE;
  bytes.set(glb, head.length + 1);

  return bytes;
}

export const errorReply = (error) => encodeReply({ ok: false, error: String(error).slice(0, 4000) });

export function decodeReply(bytes) {
  if (!(bytes instanceof Uint8Array)) return { header: { ok: false, error: 'The converter sent no reply.' } };

  const end = bytes.indexOf(NEWLINE);
  const headText = fromUtf8.decode(end < 0 ? bytes : bytes.subarray(0, end));

  try {
    return { header: JSON.parse(headText), glb: end < 0 ? new Uint8Array(0) : bytes.subarray(end + 1) };
  } catch {
    return { header: { ok: false, error: 'The converter sent an unreadable reply.' } };
  }
}
