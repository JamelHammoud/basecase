import { electricalScenes } from '../../src/wiring/electricalFixtures';
import { electricalPackage } from '../../src/wiring/electricalPackage';
import { expectedConnections } from './expected';
import { electricalProjection } from '../../src/wiring/electrical';
import { ELECTRICAL_PIN_MAPS } from '../../src/wiring/electricalPinMaps';
import { boardFixture } from './boardFixtures';

export async function acceptanceFixtures(selectedName?: string) {
  const records = [];

  for (const { name, scene } of electricalScenes()) {
    if (selectedName && name !== selectedName) continue;

    const made = await electricalPackage(scene);
    const reopened = await electricalPackage(JSON.parse(JSON.stringify(scene)));
    const maps = structuredClone(ELECTRICAL_PIN_MAPS);

    maps[0].ports[0].pins[0].function = 'data';

    const wrongPins = electricalProjection({ ...scene, pinMaps: maps });
    const highSupply = electricalProjection({
      ...scene,
      project: { ...scene.project, tether: { volts: 48, amps: 0.5 } },
    });

    records.push({
      board: await boardFixture(scene),
      name,
      ...made,
      reopened: reopened.bytes,
      expected: expectedConnections(name, scene),
      requirements: JSON.parse(made.files['requirements.json']).projection.requirements,
      negativeControls: { wrongPins: wrongPins.requirements, highSupply: highSupply.requirements },
    });
  }

  return records;
}
