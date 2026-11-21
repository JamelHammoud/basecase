import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { fitComparisonParts, writeFitPlate } from './fitPlateWriter';
import { fitTestReport } from './fitTest';
import { resolvePrinter } from '../data/printers';
import { DEFAULT_PROJECT } from '../types/robotics';
import { jobSpec } from './job';
import type { FitPlateIdentity } from './fitVariantIdentity';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { provideMeshFiles } from '../three/componentMeshes';
import { fitBindings, prepareFitVariants, fitVariantEdit, FIT_VARIANT_LIMITS } from './fitVariants';
import { fitSourceHash } from './fitVariantIdentity';
import { fitVariantCoupons } from './fitVariantGeometry';
import { FIT_INTERFACES, fitServices, generatedFit } from './fitVariants.fixtures';
import { surfaceOperands } from '../booleans/operands';
import { prepareParameterEdit } from '../utils/designParameters/transaction';
import { editParameterDesign } from '../utils/designParameters/edits';

beforeAll(async () => {
  const ids = ['feetech-sts3215', 'nema17-17hs4401'];
  const files = await Promise.all(
    ids.map(async (id) => {
      const bytes = await readFile(new URL(`../../public/parts/${id}.glb`, import.meta.url));

      return [id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)] as const;
    }),
  );

  provideMeshFiles(Object.fromEntries(files));
});

const services = { ...fitServices, sourceHash: fitSourceHash, cut: fitVariantCoupons };
const request = (design: Awaited<ReturnType<typeof generatedFit>>, values: number[]) => ({
  binding: fitBindings(design)[0],
  fit: 'mate',
  material: 'PETG' as const,
  values,
  down: [1, 0, 0] as [number, number, number],
});

function boreWidth(positions: Float32Array) {
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const bvh = new MeshBVH(geometry);
  const distances = [-1, 1].map(
    (sign) =>
      bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sign, 0, 0)), THREE.DoubleSide)!
        .distance,
  );

  geometry.dispose();

  return distances[0] + distances[1];
}

function exportedTriangles(xml: string) {
  return new Map(
    [...xml.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)].map((match) => {
      const vertices = [...match[2].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((v) =>
        v.slice(1, 4).map(Number),
      );
      const triangles = [...match[2].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].flatMap((triangle) =>
        triangle.slice(1, 4).flatMap((index) => vertices[Number(index)]),
      );

      return [Number(match[1]), Float32Array.from(triangles)];
    }),
  );
}

describe('comparison fit preparation through real parameter geometry and coupons', () => {
  it.each(FIT_INTERFACES)('$name retains exact authored dimensions and source geometry', async (fixture) => {
    const design = await generatedFit(fixture);
    const saved = JSON.stringify(design);
    const values = [fixture.width - 0.1, fixture.width, fixture.width + 0.1];
    const prepared = await prepareFitVariants(design, request(design, values), services);

    expect(prepared.candidates.map((c) => c.reason)).toEqual([undefined, undefined, undefined]);

    for (const [index, candidate] of prepared.candidates.entries()) {
      expect(boreWidth(candidate.coupon!.positions)).toBeCloseTo(values[index], 3);
      expect(candidate.coupon!.pose.down).toEqual([1, 0, 0]);
    }

    const parts = fitComparisonParts(prepared);
    const coupons = prepared.candidates.map((candidate) => candidate.coupon!);
    const printer = resolvePrinter('bambu-lab-p1s', []);
    const report = fitTestReport(coupons, parts, { project: DEFAULT_PROJECT, printer });
    const plates = jobSpec(report.plan, printer, DEFAULT_PROJECT);
    const files = (await writeFitPlate({ coupons, parts, plates, comparison: prepared })).files;
    const entries = unzipSync(files.PETG);
    const identity: FitPlateIdentity = JSON.parse(strFromU8(entries['Metadata/basecase-fit-test.json']));
    const meshes = exportedTriangles(strFromU8(entries['3D/3dmodel.model']));

    expect(report.plan.plates).toHaveLength(1);
    expect(meshes.size).toBe(3);
    expect(identity.interface).toEqual(design.parts[1]);

    for (const [index, candidate] of identity.candidates.entries()) {
      expect(candidate.value).toBe(values[index]);
      expect(candidate.unit).toBe('mm');
      expect(candidate.objects).toHaveLength(1);
      expect(boreWidth(meshes.get(candidate.objects[0].id)!)).toBeCloseTo(values[index], 3);
    }

    expect(JSON.stringify(design)).toBe(saved);

    const repeated = await prepareFitVariants(design, request(design, values), services);

    expect(repeated.candidates).toEqual(prepared.candidates);

    const edited = editParameterDesign(design, fitVariantEdit(prepared, 2, design));
    const applied = await prepareParameterEdit(edited, fitServices);

    expect(surfaceOperands(applied.parts).find((p) => p.id === 'bore')!.dimensions.width).toBe(values[2]);
    expect(applied.parts[1]).toBe(design.parts[1]);
  });

  it('retains local orientation on rotated hosts and rejects changed or deleted sources', async () => {
    const design = await generatedFit(FIT_INTERFACES[1], true);
    const prepared = await prepareFitVariants(design, request(design, [21.9, 22, 22.1]), services);

    expect(prepared.candidates[0].coupon!.pose.down).toEqual([1, 0, 0]);
    expect(boreWidth(prepared.candidates[0].coupon!.positions)).toBeCloseTo(21.9, 3);
    expect(() => fitVariantEdit(prepared, 0, { ...design, parts: design.parts.slice(1) })).toThrow();
    expect(() =>
      fitVariantEdit(prepared, 0, { ...design, parameters: [{ name: 'bore', unit: 'mm', value: 23 }] }),
    ).toThrow();
  });

  it('bounds work before dispatch, retains failed candidates and cancels without dispatching later values', async () => {
    const design = await generatedFit();
    const controller = new AbortController();
    let count = 0;
    const controlled = {
      ...services,
      signal: controller.signal,
      cut: async (input: Parameters<typeof fitVariantCoupons>[0]) => {
        count++;
        controller.abort();

        return fitVariantCoupons(input);
      },
    };

    await expect(
      prepareFitVariants(design, request(design, Array(FIT_VARIANT_LIMITS.count + 1).fill(22)), services),
    ).rejects.toThrow();
    expect(count).toBe(0);
    await expect(prepareFitVariants(design, request(design, [22, 22.1]), controlled)).rejects.toThrow(/cancel/i);
    expect(count).toBe(1);

    const failed = await prepareFitVariants(design, request(design, [22, 1000]), services);

    expect(failed.candidates[0].coupon).toBeDefined();
    expect(failed.candidates[1].reason).toBeTruthy();
    expect(() => fitVariantEdit(failed, 1, design)).toThrow();
  });
});
