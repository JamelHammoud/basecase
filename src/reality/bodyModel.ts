import type { SimModel } from '../sim/mjcfTypes';
import { esc, f, vec } from '../sim/mjcfText';
import { hashText } from '../utils/geometryHash';
import type { BodyFit } from './bodyTypes';
import { bodyFitApplies, bodyKey } from './bodyLayout';

const BODY_TAG = /<body\b[^>]*>|<\/body>|<geom\b[^>]*\/>/g;
const attr = (tag: string, key: string) => new RegExp(`\\b${key}="([^"]*)"`).exec(tag)?.[1];
const massOf = (tag: string) => Number(attr(tag, 'mass') ?? 0);

function checkFit(model: SimModel, robot: string, fit: BodyFit) {
  const missingPosition = Object.keys(fit.payloadKg).some((body) => !model.bodyPayloads?.[body]);

  if (!bodyFitApplies(fit, model.bodies, robot) || missingPosition)
    throw new Error('Body fit needs positive mass and friction scales and nonnegative payloads on terminal links.');
}

function floorFriction(tag: string, scale: number): string {
  if (attr(tag, 'contype') !== '0' || attr(tag, 'conaffinity') !== '1' || scale === 1) return tag;

  const coefficient = Number(attr(tag, 'friction')?.split(' ')[0] ?? 0.9) * scale;
  const friction = `friction="${f(coefficient)} 0.02 0.002"`;
  const priority = attr(tag, 'priority')
    ? tag.replace(/\bpriority="[^"]*"/, 'priority="1"')
    : tag.replace('/>', ' priority="1"/>');

  return attr(priority, 'friction')
    ? priority.replace(/\bfriction="[^"]*"/, friction)
    : priority.replace('/>', ` ${friction}/>`);
}

function payloadGeom(model: SimModel, body: string, fit: BodyFit): string {
  const kg = fit.payloadKg[body] ?? 0;
  const at = model.bodyPayloads?.[body];

  if (!kg || !at) return '';

  return `<geom name="payload_${esc(body)}" type="sphere" size="0.001" pos="${vec(at)}" mass="${f(kg)}" contype="0" conaffinity="0"/>`;
}

function fittedXml(model: SimModel, own: Set<string>, fit: BodyFit) {
  const bodies: string[] = [];
  let massDelta = 0;
  const xml = model.xml.replace(BODY_TAG, (tag) => {
    if (tag.startsWith('<body')) {
      bodies.push(attr(tag, 'name') ?? '');

      return tag;
    }

    const body = bodies.at(-1) ?? '';

    if (tag === '</body>') {
      bodies.pop();

      const payload = own.has(body) ? payloadGeom(model, body, fit) : '';

      massDelta += own.has(body) ? (fit.payloadKg[body] ?? 0) : 0;

      return payload ? `${payload}\n${tag}` : tag;
    }

    if (!own.has(body) || attr(tag, 'name')?.startsWith('payload_')) return tag;

    const mass = massOf(tag);
    const scaled = Number(f(mass * (fit.massScales[body] ?? 1)));

    massDelta += scaled - mass;

    return tag.replace(/\bmass="[^"]*"/, `mass="${f(scaled)}"`);
  });

  return { xml, massDelta };
}

const canonicalFit = (fit: BodyFit, keys: Map<string, string>) =>
  JSON.stringify({
    massScales: Object.entries(fit.massScales)
      .filter(([, s]) => s !== 1)
      .map(([name, scale]) => [keys.get(name) ?? name, scale] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
    payloadKg: Object.entries(fit.payloadKg)
      .filter(([, kg]) => kg > 0)
      .map(([name, kg]) => [keys.get(name) ?? name, kg] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
    floorFrictionScale: fit.floorFrictionScale,
  });

export function applyBodyFit(model: SimModel, robot: string, fit: BodyFit): SimModel {
  return applyBodyFits(model, { [robot]: fit }, robot);
}

const IDENTITY_BODY: BodyFit = { massScales: {}, payloadKg: {}, floorFrictionScale: 1 };

const identityFit = (fit: BodyFit) =>
  Object.values(fit.massScales).every((scale) => scale === 1) &&
  Object.values(fit.payloadKg).every((kg) => kg === 0) &&
  fit.floorFrictionScale === 1;

export function applyBodyFits(model: SimModel, fits: Record<string, BodyFit>, floorRobot?: string): SimModel {
  Object.entries(fits).forEach(([robot, fit]) => checkFit(model, robot, fit));

  if (Object.values(fits).every(identityFit)) return model;

  let current = model;

  for (const [robot, fit] of Object.entries(fits)) {
    const own = new Set(model.bodies.filter((b) => b.robot === robot).map((b) => b.name));
    const applied = fittedXml(current, own, fit);

    current = {
      ...current,
      xml: applied.xml,
      massKg: { ...current.massKg, [robot]: current.massKg[robot] + applied.massDelta },
    };
  }

  const floor = fits[floorRobot ?? '']?.floorFrictionScale ?? 1;
  const keys = new Map(model.bodies.map((body) => [body.name, bodyKey(body)]));

  return {
    ...current,
    xml: current.xml.replace(/<geom\b[^>]*\/>/g, (tag) => floorFriction(tag, floor)),
    robots: model.robots.map((r) => {
      const effective = { ...(fits[r.key] ?? IDENTITY_BODY), floorFrictionScale: floor };

      return {
        ...r,
        fingerprint: identityFit(effective)
          ? r.fingerprint
          : hashText(`${r.fingerprint}\n${canonicalFit(effective, keys)}`),
      };
    }),
  };
}
