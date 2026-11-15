const HOSTS = new Set(['app.roboflow.com', 'universe.roboflow.com']);
const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export const LINK_HINT = 'Paste a Roboflow project or dataset version link.';

export function isRoboflowLink(link) {
  try {
    return HOSTS.has(new URL(link).hostname);
  } catch {
    return false;
  }
}

function checkedUrl(link) {
  if (typeof link !== 'string' || link.includes('\\') || link.includes('%')) throw new Error(LINK_HINT);

  if (link.split('/').some((segment) => segment === '.' || segment === '..')) throw new Error(LINK_HINT);

  let url;

  try {
    url = new URL(link);
  } catch {
    throw new Error(LINK_HINT);
  }

  const forbidden = [url.port, url.username, url.password, url.search, url.hash];

  if (!HOSTS.has(url.hostname) || url.protocol !== 'https:' || forbidden.some(Boolean)) throw new Error(LINK_HINT);

  return url;
}

function versionOfPath(parts, universe) {
  if (parts.length === 2) return undefined;

  const version = universe ? parts[3] : parts[2];
  const expected = universe ? 4 : 3;

  if (parts.length !== expected || (universe && parts[2] !== 'dataset') || !/^[1-9]\d{0,5}$/.test(version ?? ''))
    throw new Error(LINK_HINT);

  return Number(version);
}

export function projectOfLink(link) {
  const url = checkedUrl(link);
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
  const [workspace, project] = parts;
  const version = versionOfPath(parts, url.hostname === 'universe.roboflow.com');

  if (!SEGMENT.test(workspace ?? '') || !SEGMENT.test(project ?? '')) throw new Error(LINK_HINT);

  return { workspace, project, ...(version && { version }) };
}
