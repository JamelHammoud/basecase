import ts from 'typescript';

const NODE_FOR_MODEL = {
  yolo11n: 'person-detection',
  'rfdetr-nano': 'object-detection',
  'depth-anything-v2-small': 'obstacle-near',
  yunet: 'face-detection',
};

export function benchmarkDevice(device) {
  if (!['mac', 'pi5'].includes(device)) throw new Error('Choose mac or pi5 for a Node WASM benchmark.');

  return device;
}

const nameOf = (property) =>
  property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text
    : undefined;
const propertyOf = (node, name) =>
  node.properties.find((property) => ts.isPropertyAssignment(property) && nameOf(property) === name);

function catalogueOf(file) {
  let catalogue;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'MODEL_NODES')
      catalogue = node.initializer;

    ts.forEachChild(node, visit);
  };

  visit(file);

  if (!catalogue || !ts.isArrayLiteralExpression(catalogue))
    throw new Error('The model node catalogue must be an array.');

  return catalogue;
}

function timingsFor(measurements) {
  const timings = new Map();

  if (!Array.isArray(measurements)) throw new Error('Supply measured model timings.');

  for (const measurement of measurements) {
    if (!Number.isFinite(measurement.medianMs) || measurement.medianMs <= 0)
      throw new Error('Measured timings must be positive finite numbers.');

    const node = Object.hasOwn(NODE_FOR_MODEL, measurement.modelId) ? NODE_FOR_MODEL[measurement.modelId] : undefined;

    if (!node) continue;

    if (timings.has(node)) throw new Error('Supply one measurement per model.');

    const duration = Number(measurement.medianMs.toFixed(2));

    if (duration <= 0) throw new Error('Measured timings must stay positive when rounded to two decimals.');

    timings.set(node, duration);
  }

  return timings;
}

function updateTimings(options) {
  const { file, node, device, duration } = options;
  const timings = propertyOf(node, 'measuredMs')?.initializer;

  if (!timings || !ts.isObjectLiteralExpression(timings)) throw new Error('Measured timings must be an object.');

  if (timings.properties.some((property) => !ts.isPropertyAssignment(property) || !nameOf(property))) {
    throw new Error('Measured timings must name each device directly.');
  }

  const replacement = ts.factory.createPropertyAssignment(device, ts.factory.createNumericLiteral(duration));
  const properties = timings.properties.map((property) => (nameOf(property) === device ? replacement : property));

  if (!propertyOf(timings, device)) properties.push(replacement);

  const updated = ts.factory.updateObjectLiteralExpression(timings, properties);
  const text = ts.createPrinter().printNode(ts.EmitHint.Expression, updated, file);

  return { start: timings.getStart(file), end: timings.end, text };
}

export function applyMeasurements(source, record) {
  const device = benchmarkDevice(record.device);
  const timings = timingsFor(record.measurements);
  const file = ts.createSourceFile('nodes.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  if (file.parseDiagnostics.length) throw new Error('The model node catalogue must parse before timings are written.');

  const catalogue = catalogueOf(file);
  const edits = [];

  for (const node of catalogue.elements) {
    if (!ts.isObjectLiteralExpression(node)) continue;

    const id = propertyOf(node, 'id')?.initializer;
    const duration = id && ts.isStringLiteral(id) ? timings.get(id.text) : undefined;

    if (duration === undefined) continue;

    edits.push(updateTimings({ file, node, device, duration }));
    timings.delete(id.text);
  }

  if (timings.size) throw new Error('A measured model has no matching catalogue node.');

  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
}
