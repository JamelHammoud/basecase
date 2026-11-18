import * as THREE from 'three';
import { wiringIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { indexRouteSpecs } from './routeSpecs';
import { expect, it } from 'vitest';
import { cableEditingDesigns } from './cableEditing.fixtures';
import { analyzeWiring } from './routeAnalysis';
import { editableNets, routeIdentity, updateRoute } from './routeEditing';
import { wiringNetlist } from './netlist';
import { buildBom } from '../utils/bom';
import { wiringRows } from './wiringChecks';

const EXPECTED: Record<string, { requiredMm: number | null; values: number[] }> = {
  'two-servo arm': { requiredMm: 243, values: [0, 15] },
  'wrist-camera arm': { requiredMm: 243, values: [0, 15] },
  rover: { requiredMm: 229, values: [-15, 15] },
  quadruped: { requiredMm: null, values: Array(12).fill(0) },
  hexapod: { requiredMm: null, values: Array(18).fill(0) },
  'pan-tilt camera': { requiredMm: 243, values: [0, 15] },
  'sliding mechanism': { requiredMm: 249, values: [-20] },
  'two-adapter servo chain': { requiredMm: 243, values: [0, 15, 15, 15] },
  'mixed servo buses': { requiredMm: 243, values: [0, 15, 15] },
  'enclosure with removable lid': { requiredMm: 295, values: [90] },
};

it.each(cableEditingDesigns())(
  'retains net identities, motion bounds and stock purchasing for $name',
  ({ name, scene, coverageLimited }) => {
    const net = editableNets(scene)[0];
    const identity = routeIdentity(net)!;
    const owner = scene.parts.find((part) => part.id === identity.from.partId)!;
    let stockScene = scene;

    for (const connection of editableNets(scene).slice(1)) {
      const supplyId = connection.from.connector === 'jst-eh-3' ? 'robot-cable-x3p' : 'waveshare-servo-cable-5264-300';

      stockScene = { ...stockScene, project: updateRoute(stockScene, routeIdentity(connection)!, { supplyId }) };
    }

    const project = updateRoute(stockScene, identity, {
      supplyId: 'waveshare-servo-cable-5264-900',
      anchors: [{ partId: owner.id, position: [0, 80, 0] }],
    });
    const edited = { ...scene, project };
    const measured = analyzeWiring(edited, []);
    const route = measured.buses[0].nets[0].route!;
    const bom = buildBom({ ...edited, wiring: measured, purchases: {}, measures: {} });

    const expected = EXPECTED[name];

    expect(route.requiredMm).toBe(expected.requiredMm);
    expect(route.limitingPose).toEqual(
      Object.fromEntries(project.joints!.map((joint, i) => [joint.id, expected.values[i]])),
    );
    expect(wiringNetlist(edited)).toEqual(wiringNetlist(scene));
    expect(indexRouteSpecs(project.wiring)(net)?.from).toEqual(identity.from);
    expect(indexRouteSpecs(project.wiring)(net)?.to).toEqual(identity.to);

    if (coverageLimited) {
      expect(route).toMatchObject({ status: 'unresolved', reason: 'Range coverage exceeds routing limit' });
      expect(wiringRows(measured, project.joints).find((row) => row.check === 'Cable reach')?.status).toBe('fail');
      expect(bom.lines.some((line) => line.key === 'supply:waveshare-servo-cable-5264-900')).toBe(false);

      return;
    }

    expect(route).toMatchObject({ status: 'pass', cableSupplyId: 'waveshare-servo-cable-5264-900', lengthMm: 900 });
    expect(route.points).toContainEqual([owner.position[0], owner.position[1] + 80, owner.position[2]]);
    expect(Object.keys(route.limitingPose).sort()).toEqual(project.joints!.map((joint) => joint.id).sort());
    expect(bom.lines.find((line) => line.key === 'supply:waveshare-servo-cable-5264-900')).toMatchObject({
      qty: 1,
      packs: 1,
    });
    expect(analyzeWiring(edited, [])).toEqual(measured);
  },
);

it.each(cableEditingDesigns())(
  'carries $name through transformed solid geometry in the analysis worker',
  async ({ scene }) => {
    const identity = routeIdentity(editableNets(scene)[0])!;
    const project = updateRoute(scene, identity, {
      supplyId: 'waveshare-servo-cable-5264-900',
      anchors: [{ partId: identity.from.partId, position: [0, 80, 0] }],
    });
    const edited = { ...scene, project };
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const objects = scene.parts.map((part) => {
      const object = new THREE.Mesh(geometry);

      object.position.set(...part.position);
      object.rotation.set(...(part.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
      object.scale.set(part.dimensions.width, part.dimensions.height, part.dimensions.depth);

      return { id: part.id, object };
    });
    const bounds = scene.parts.map((part) => ({
      id: part.id,
      min: [
        part.position[0] - part.dimensions.width / 2,
        part.position[1] - part.dimensions.height / 2,
        part.position[2] - part.dimensions.depth / 2,
      ] as [number, number, number],
      max: [
        part.position[0] + part.dimensions.width / 2,
        part.position[1] + part.dimensions.height / 2,
        part.position[2] + part.dimensions.depth / 2,
      ] as [number, number, number],
    }));
    const reference = analyzeWiring(edited, bounds);
    const measured = await wiringIn(snapshotShapes(objects), edited);

    expect(measured).toEqual(reference);
    expect(measured.buses.map((bus) => bus.servos)).toEqual(wiringNetlist(scene).buses.map((bus) => bus.servos));
    expect(buildBom({ ...edited, wiring: measured, purchases: {}, measures: {} }).lines).toEqual(
      buildBom({ ...edited, wiring: reference, purchases: {}, measures: {} }).lines,
    );
    geometry.dispose();
  },
);
