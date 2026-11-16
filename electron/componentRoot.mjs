export function componentRoot(parents, id) {
  let root = id;
  let next = parents.get(root);

  while (next !== undefined && next !== root) {
    root = next;
    next = parents.get(root);
  }

  let current = id;

  while (current !== root) {
    const parent = parents.get(current);

    parents.set(current, root);
    current = parent;
  }

  parents.set(root, root);

  return root;
}
