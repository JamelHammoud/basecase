import ts from 'typescript';
import { NATIVE_DIALOG_CALLS, NATIVE_DIALOG_KEYS, NATIVE_MENU_CALLS, NATIVE_MENU_FILE } from './surfaces.mjs';

function initializerOf(node) {
  let scope = node.parent;

  while (scope) {
    const parameter = scope.parameters?.some((entry) => ts.isIdentifier(entry.name) && entry.name.text === node.text);

    if (parameter) return null;

    const statements = scope.statements ?? [];
    const declarations = statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations);
    const declaration = declarations.find((entry) => ts.isIdentifier(entry.name) && entry.name.text === node.text);

    if (declaration) return declaration.initializer ?? null;

    scope = scope.parent;
  }

  return null;
}

export function nativeStrings(node, { file, stringsOf }) {
  const read = (value) => {
    const resolved = ts.isIdentifier(value) ? initializerOf(value) : value;

    return resolved && !ts.isIdentifier(resolved) ? stringsOf(resolved) : [];
  };
  const tagged = (value, kind) => read(value).map((hit) => ({ ...hit, kind }));

  if (file === NATIVE_MENU_FILE && ts.isPropertyAssignment(node) && node.name.getText() === 'label') {
    return tagged(node.initializer, 'label');
  }

  if (!ts.isCallExpression(node)) return [];

  const callee = node.expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText();

  if (file === NATIVE_MENU_FILE && NATIVE_MENU_CALLS.has(name) && node.arguments[0]) {
    return tagged(node.arguments[0], 'label');
  }

  if (!ts.isPropertyAccessExpression(callee) || callee.expression.getText() !== 'dialog') return [];

  if (name === 'showErrorBox') return node.arguments.slice(0, 2).flatMap((arg) => tagged(arg, 'message'));

  if (!NATIVE_DIALOG_CALLS.has(name)) return [];

  return node.arguments.filter(ts.isObjectLiteralExpression).flatMap((options) =>
    options.properties
      .filter((prop) => ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop))
      .flatMap((prop) => {
        const key = prop.name.getText().replaceAll(/['"]/g, '');

        if (NATIVE_DIALOG_KEYS.has(key)) return tagged(prop.initializer ?? prop.name, key);

        if (key === 'buttons' && prop.initializer && ts.isArrayLiteralExpression(prop.initializer)) {
          return prop.initializer.elements.flatMap((element) => tagged(element, 'buttonLabel'));
        }

        return [];
      }),
  );
}
