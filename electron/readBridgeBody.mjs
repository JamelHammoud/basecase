export const BODY_TOO_LARGE = 'Send a smaller request';

export function readBridgeBody({ req, res, limit, onBody }) {
  let chunks = [];
  let length = 0;
  let stopped = false;

  const stop = () => {
    stopped = true;
    chunks = [];
    req.removeListener('data', receive);
    req.removeListener('end', finish);
    req.removeListener('aborted', stop);
  };
  const refuse = () => {
    stop();
    req.pause();
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Connection', 'close');
    res.end(JSON.stringify({ error: BODY_TOO_LARGE }));
  };
  const receive = (chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    length += bytes.byteLength;

    if (length > limit) {
      refuse();

      return;
    }

    chunks.push(bytes);
  };
  const finish = () => {
    if (stopped) return;

    const body = Buffer.concat(chunks, length).toString('utf8');

    stop();
    onBody(body);
  };
  const declaredLength = req.headers['content-length'];

  req.once('error', stop);

  if (/^\d+$/.test(declaredLength ?? '') && Number(declaredLength) > limit) {
    refuse();

    return;
  }

  req.on('data', receive);
  req.once('end', finish);
  req.once('aborted', stop);
}
