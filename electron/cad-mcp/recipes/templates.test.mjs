import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderPart } from '../../cad-kernel/client.mjs';
import { scadPortsParallel } from './scadPorts.mjs';
import { CATALOG_HORN, armTemplate, bipedTemplate } from './templates.mjs';

const DEG = Math.PI / 180;
const TEMPLATES = { arm: armTemplate(), biped: bipedTemplate() };
const parts = Object.entries(TEMPLATES).flatMap(([template, t]) => t.parts.map((p) => ({ template, ...p })));

const matrixOf = ({ position, rotation }) =>
  new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(...rotation.map((v) => v * DEG), 'XYZ'))
    .setPosition(...position);

let compiled = [];
let echoed = [];

beforeAll(async () => {
  const [results, batch] = await Promise.all([
    Promise.all(parts.map((p) => renderPart('openscad', p.code))),
    scadPortsParallel(parts.map((p) => p.code)),
  ]);

  compiled = results;
  echoed = batch.ports;
}, 180000);

function servoHorns(template) {
  return template.servos.map((s) => {
    const m = matrixOf(s);

    return {
      id: s.id,
      at: CATALOG_HORN.clone().applyMatrix4(m),
      axis: new THREE.Vector3(0, 0, 1).transformDirection(m),
    };
  });
}

function worldPorts(name) {
  return parts.flatMap((p, i) => {
    if (p.template !== name) return [];

    const m = matrixOf(p);

    return echoed[i].map((port) => ({
      part: p.id,
      name: port.name,
      kind: port.kind,
      at: new THREE.Vector3(...port.pos).applyMatrix4(m),
      axis: new THREE.Vector3(...port.axis).transformDirection(m),
    }));
  });
}

function matches(horn, ports, sign) {
  return ports.filter((p) => p.at.distanceTo(horn.at) < 0.1 && p.axis.dot(horn.axis) * sign > 0.999).map((p) => p.part);
}

describe.each(Object.keys(TEMPLATES))('%s template', (name) => {
  const template = TEMPLATES[name];

  it('compiles every printed part cleanly', () => {
    parts.forEach((p, i) => {
      if (p.template !== name) return;

      expect(compiled[i].error ?? '', p.id).toBe('');
      expect(compiled[i].warnings, p.id).toEqual([]);
    });
  });

  it('holds each catalog servo in one cradle and drives one U-link from its horn', () => {
    const ports = worldPorts(name);
    const outputs = ports.filter((p) => p.kind === 'output');
    const links = ports.filter((p) => p.kind === 'hole_circle' && /(^|_)horn$/.test(p.name));

    for (const horn of servoHorns(template)) {
      expect(matches(horn, outputs, 1), `${horn.id} cradle`).toHaveLength(1);
      expect(matches(horn, links, -1), `${horn.id} link`).toHaveLength(1);
    }
  });

  it('declares joints between parts that exist', () => {
    const ids = new Set([...template.parts.map((p) => p.id), ...template.servos.map((s) => s.id)]);

    for (const joint of template.joints) {
      expect(
        [...joint.parent, ...joint.child, ...joint.actuators].every((id) => ids.has(id)),
        joint.id,
      ).toBe(true);
    }
  });
});
