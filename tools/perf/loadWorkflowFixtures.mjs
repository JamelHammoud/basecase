import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export async function loadWorkflowFixtures() {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      try {
        return next(specifier, context);
      } catch (error) {
        if (!specifier.startsWith('.')) throw error;

        for (const suffix of ['.ts', '.tsx', '.mjs']) {
          const target = new URL(`${specifier}${suffix}`, context.parentURL);

          if (fs.existsSync(target)) return next(target.href, context);
        }

        throw error;
      }
    },
    load(url, context, next) {
      if (url.endsWith('.json'))
        return {
          format: 'module',
          source: `export default ${fs.readFileSync(fileURLToPath(url), 'utf8')}`,
          shortCircuit: true,
        };

      if (!/\.tsx?$/.test(url)) return next(url, context);

      const code = fs.readFileSync(fileURLToPath(url), 'utf8');
      const output = ts.transpileModule(
        code.replaceAll('import.meta.env', "({ MODE: 'production', DEV: false, PROD: true, BASE_URL: '/' })"),
        {
          fileName: fileURLToPath(url),
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
        },
      );

      return { format: 'module', source: output.outputText, shortCircuit: true };
    },
  });

  try {
    return {
      ...(await import('../../e2e/agentWorkflowFixtures.ts')),
      ...(await import('../../e2e/agentWorkflowBackend.ts')),
    };
  } finally {
    hooks.deregister();
  }
}
