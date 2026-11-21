import assert from 'node:assert/strict';

const decode = (value) =>
  value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

function field(body, name) {
  const match = new RegExp(`<field name="${name}">([^<]*)</field>`).exec(body);

  return decode(match?.[1] ?? '');
}

export function xmlConnections(xml) {
  const components = new Map(
    [...xml.matchAll(/<comp ref="([^"]+)">([\s\S]*?)<\/comp>/g)].map((match) => [
      match[1],
      { part: field(match[2], 'ScenePart'), port: field(match[2], 'Port') },
    ]),
  );
  const nets = [...xml.matchAll(/<net code="\d+" name="[^"]+"[^>]*>([\s\S]*?)<\/net>/g)];

  assert.ok(nets.length, 'KiCad exported no nets');

  return nets
    .map((match) =>
      [...match[1].matchAll(/<node ref="([^"]+)" pin="([^"]+)"/g)]
        .map((node) => {
          const component = components.get(node[1]);

          assert.ok(component, `Missing component ${node[1]}`);

          return JSON.stringify([component.part, component.port, decode(node[2])]);
        })
        .sort(),
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
