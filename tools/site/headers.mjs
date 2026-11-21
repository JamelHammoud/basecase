export function globalHeaders(source) {
  let global = false;
  const headers = {};

  for (const line of source.split(/\r?\n/)) {
    if (line && !/^\s/.test(line)) {
      global = line === '/*';

      continue;
    }

    const match = global && line.match(/^\s+([^:]+):\s*(.*)$/);

    if (match) headers[match[1].toLowerCase()] = match[2];
  }

  return headers;
}

export function headerProblems(source, { full = false } = {}) {
  const headers = globalHeaders(source);
  const required = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000',
  };
  const directives = new Map(
    (headers['content-security-policy'] ?? '')
      .split(';')
      .reverse()
      .map((part) => {
        const [name, ...values] = part.trim().split(/\s+/);

        return [name.toLowerCase(), values.join(' ')];
      }),
  );
  const requiredDirectives = { 'frame-ancestors': "'none'", 'object-src': "'none'", 'base-uri': "'none'" };

  if (full) Object.assign(requiredDirectives, { 'default-src': "'self'", 'script-src': "'self'" });

  return [
    ...Object.entries(required)
      .filter(([name, value]) => headers[name] !== value)
      .map(([name, value]) => `_headers: /* must set ${name}: ${value}`),
    ...Object.entries(requiredDirectives)
      .filter(([name, value]) => directives.get(name) !== value)
      .map(([name, value]) => `_headers: /* Content-Security-Policy must set ${name} ${value}`),
  ];
}
