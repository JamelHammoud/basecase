import * as THREE from 'three';
import type { GridSpec, LabelColor } from '../../utils/labelOverlay';

const GOLDEN_ANGLE = 137.508;

export function labelColors(ids: string[]): LabelColor[] {
  return ids.map((id, i) => {
    const color = new THREE.Color().setHSL(
      ((i * GOLDEN_ANGLE) % 360) / 360,
      0.75,
      [0.45, 0.62, 0.35][i % 3],
      THREE.SRGBColorSpace,
    );
    const rgb = color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);

    return { id, label: i + 1, rgb: [rgb.r, rgb.g, rgb.b].map((v) => Math.round(v * 255)) as LabelColor['rgb'] };
  });
}

type Painted = THREE.Mesh & { material: THREE.Material | THREE.Material[] };

export function paintFlat(partsRoot: THREE.Object3D, colors: LabelColor[]): () => void {
  const byId = new Map(colors.map((c) => [c.id, c]));
  const swapped: Array<{ mesh: Painted; material: THREE.Material | THREE.Material[] }> = [];
  const made: THREE.Material[] = [];

  for (const group of partsRoot.children) {
    const color = byId.get(group.userData.partId as string);

    if (!color) continue;

    const flat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });

    flat.color.setRGB(color.rgb[0] / 255, color.rgb[1] / 255, color.rgb[2] / 255, THREE.SRGBColorSpace);
    made.push(flat);
    group.traverse((o) => {
      const mesh = o as Painted;

      if (!mesh.isMesh) return;

      swapped.push({ mesh, material: mesh.material });
      mesh.material = flat;
    });
  }

  return () => {
    swapped.forEach(({ mesh, material }) => (mesh.material = material));
    made.forEach((m) => m.dispose());
  };
}

const SCENE_TO_AGENT = (v: THREE.Vector3) => new THREE.Vector3(v.x, -v.z, v.y);
const AXIS_NAMES = ['x', 'y', 'z'];

function axisOf(sceneDirection: THREE.Vector3): { axis: string; sign: number } | null {
  const agent = SCENE_TO_AGENT(sceneDirection).toArray();
  const k = agent.findIndex((v) => Math.abs(v) > 0.98);

  return k < 0 ? null : { axis: AXIS_NAMES[k], sign: Math.sign(agent[k]) };
}

const NICE_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

export function gridSpec(camera: THREE.PerspectiveCamera, center: THREE.Vector3, heightPx: number): GridSpec | null {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const h = axisOf(right);
  const v = axisOf(up);

  if (!h || !v) return null;

  const distance = camera.position.distanceTo(center);
  const mmPerPx = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / heightPx;
  const step = NICE_STEPS.find((s) => s / mmPerPx >= 40) ?? 1000;
  const agentCenter = SCENE_TO_AGENT(center);
  const coord = (a: { axis: string }) => agentCenter.getComponent(AXIS_NAMES.indexOf(a.axis));

  return {
    mmPerPx,
    stepMm: step,
    horizontal: { ...h, atCenter: coord(h) },
    vertical: { ...v, atCenter: coord(v) },
  };
}
