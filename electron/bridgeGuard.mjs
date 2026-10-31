const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

function loopbackHost(host) {
  try {
    return LOOPBACK_HOSTS.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function sameOrigin(origin, host) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isTrustedBridgeRequest(headers = {}) {
  const { host, origin } = headers;
  const site = headers['sec-fetch-site'];

  if (!host || !loopbackHost(host)) return false;

  if (site && !TRUSTED_FETCH_SITES.has(site)) return false;

  return origin === undefined || sameOrigin(origin, host);
}

export function guardBridge(handler) {
  return (req, res, next) => {
    if (isTrustedBridgeRequest(req.headers)) {
      handler(req, res, next);

      return;
    }

    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Bridge requests must come from the app on this machine' }));
  };
}
