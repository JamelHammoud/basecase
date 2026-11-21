import type {
  ElectricalEndpoint,
  ElectricalFunction,
  ElectricalNet,
  ElectricalNode,
  ElectricalPartMap,
} from './electricalTypes';
import { compareElectricalIds } from './electricalSource';

export const nodeKey = (node: ElectricalNode) => JSON.stringify([node.reference, node.pin]);

function joinCommon(
  ends: ElectricalEndpoint[],
  kind: ElectricalFunction,
  join: (a: ElectricalNode, b: ElectricalNode) => void,
) {
  let first: ElectricalNode | undefined;

  for (const end of ends) {
    for (const pin of end.map?.pins ?? []) {
      if (pin.function !== kind) continue;

      const node = { reference: end.reference, pin: pin.number };

      if (first) join(first, node);
      else first = node;
    }
  }
}

export function electricalGraph(endpoints: ElectricalEndpoint[]) {
  const parents = new Map<string, string>();
  const nodes = new Map<string, ElectricalNode>();
  const pins = new Map(
    endpoints.flatMap((end) =>
      (end.map?.pins ?? []).map((pin) => [nodeKey({ reference: end.reference, pin: pin.number }), pin]),
    ),
  );
  const root = (key: string): string => {
    const parent = parents.get(key);

    if (!parent || parent === key) return key;

    const found = root(parent);

    parents.set(key, found);

    return found;
  };
  const join = (a: ElectricalNode, b: ElectricalNode) => {
    const ak = nodeKey(a);
    const bk = nodeKey(b);

    nodes.set(ak, a);
    nodes.set(bk, b);
    parents.set(root(bk), root(ak));
  };
  const common = (map: ElectricalPartMap, ends: ElectricalEndpoint[]) => {
    for (const kind of map.common) joinCommon(ends, kind, join);
  };
  const nets = (): ElectricalNet[] => {
    const groups = new Map<string, ElectricalNode[]>();

    for (const [key, node] of nodes) {
      const name = root(key);
      const group = groups.get(name) ?? [];

      group.push(node);
      groups.set(name, group);
    }

    return [...groups.values()].map((members, index) => ({
      name: `N${index + 1}`,
      function: pins.get(nodeKey(members[0]))!.function,
      nodes: members.sort((a, b) => compareElectricalIds(nodeKey(a), nodeKey(b))),
      bus: null,
      buses: [],
      nominalV: null,
      maximumV: null,
      declaredA: null,
      loadA: null,
      transientA: null,
      sourceReferences: [],
      interfaceLimitA: null,
      standingServoEstimateA: null,
      modeledServoPeakA: null,
      currentModel: null,
      interfaceRatings: [],
    }));
  };

  return { join, common, nets };
}
