export const fromCompiledModule = (module) => (imports, done) => {
  WebAssembly.instantiate(module, imports).then((instance) => done(instance, module));

  return {};
};
