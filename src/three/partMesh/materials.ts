import * as THREE from 'three';
import type { PartRole } from '../../types/robotics';

const MIN_LIGHTNESS = 0.13;
const SELECTED_EDGE = 0x0d99ff;
const CUTOUT = '#ef4444';

export function displayColor(hex: string): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };

  color.getHSL(hsl, THREE.SRGBColorSpace);

  if (hsl.l < MIN_LIGHTNESS) color.setHSL(hsl.h, hsl.s, MIN_LIGHTNESS, THREE.SRGBColorSpace);

  return color;
}

export interface MaterialOptions {
  color: string;
  role: PartRole;
  selected: boolean;
  roughness?: number;
  metalness?: number;
}

const cutoutMaterial = (selected: boolean) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(CUTOUT),
    transparent: true,
    opacity: selected ? 0.52 : 0.35,
    roughness: 0.3,
    metalness: 0.05,
    depthWrite: false,
  });

const referenceMaterial = (color: string, selected: boolean) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || '#06b6d4'),
    transparent: true,
    opacity: selected ? 0.85 : 0.65,
    roughness: 0.2,
    metalness: 0.1,
    emissive: new THREE.Color(color || '#06b6d4'),
    emissiveIntensity: 0.25,
  });

const solidMaterial = ({ color, selected, roughness = 0.38, metalness = 0.12 }: MaterialOptions) => {
  const material = new THREE.MeshStandardMaterial({
    color: displayColor(color || '#e4e4e7'),
    roughness,
    metalness,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  if (selected) {
    material.emissive = new THREE.Color('#2563eb');
    material.emissiveIntensity = 0.12;
  }

  return material;
};

export function createMaterial(options: MaterialOptions): THREE.MeshStandardMaterial {
  if (options.role === 'cutout') {
    return cutoutMaterial(options.selected);
  }

  if (options.role === 'reference') {
    return referenceMaterial(options.color, options.selected);
  }

  return solidMaterial(options);
}

const ROLE_EDGE_COLOR: Partial<Record<PartRole, number>> = { cutout: 0xef4444, reference: 0x06b6d4 };
const ROLE_EDGE_OPACITY: Partial<Record<PartRole, number>> = { cutout: 0.85 };

export function crispEdgeMaterial(role: PartRole, selected: boolean): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: selected ? SELECTED_EDGE : (ROLE_EDGE_COLOR[role] ?? 0x3f3f46),
    transparent: true,
    opacity: selected ? 0.98 : (ROLE_EDGE_OPACITY[role] ?? 0.38),
  });
}

export function cadEdgeMaterial(role: PartRole, selected: boolean): THREE.LineBasicMaterial {
  const color = role === 'cutout' ? 0xef4444 : 0x18181b;

  return new THREE.LineBasicMaterial({
    color: selected ? SELECTED_EDGE : color,
    transparent: true,
    opacity: selected ? 0.95 : 0.55,
  });
}

export function highlightEdgeMaterial(selected: boolean, opacity: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: selected ? SELECTED_EDGE : 0xef4444, transparent: true, opacity });
}
