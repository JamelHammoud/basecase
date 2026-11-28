import fs from 'node:fs';
import path from 'node:path';

export function profileFixture(root) {
  const fixture = JSON.parse(fs.readFileSync(new URL('./profileRefresh.fixture.json', import.meta.url), 'utf8'));

  return fixture.map(({ slicer, version, files }) => {
    const profiles = path.join(root, slicer);

    for (const [name, data] of Object.entries(files)) {
      const file = path.join(profiles, name);

      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
    }

    return { slicer, version, profiles, ...(slicer === 'orca' ? { makers: ['Prusa'] } : {}) };
  });
}
