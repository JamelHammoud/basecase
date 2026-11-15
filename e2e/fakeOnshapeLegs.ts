import { fakeArm, limitFeature, mateFeature, type AssemblyInstance, type SubAssembly } from './fakeOnshape';

interface LegOptions {
  count?: number;
  nested?: boolean;
  limits?: boolean;
  cylindrical?: boolean;
  configuration?: string;
}

const knee = (a: string, b: string, type: string, name: string) =>
  mateFeature('Melbow', name, type, [
    { path: [a], origin: [0, 0, 0] },
    { path: [b], origin: [0, 0, 0] },
  ]);

export function fakeLegs({
  count = 4,
  nested = false,
  limits = true,
  cylindrical = false,
  configuration = 'default',
}: LegOptions = {}) {
  const arm = fakeArm({ wrist: true, gripper: cylindrical });
  const root = arm.definition.rootAssembly;
  const [base, thigh, ...moving] = root.instances;
  const shin = moving.at(-1)!;
  const [baseOccurrence, ...movingOccurrences] = root.occurrences;
  const element = {
    documentId: base.documentId,
    elementId: 'a'.repeat(24),
    documentMicroversion: 'b'.repeat(24),
    configuration,
  };
  const leg: SubAssembly = {
    ...element,
    instances: [thigh, ...moving],
    features: [
      knee(thigh.id, shin.id, 'REVOLUTE', 'Knee'),
      ...(cylindrical
        ? [
            {
              ...knee(shin.id, moving[0].id, 'CYLINDRICAL', 'Axle'),
              id: 'Maxle',
            },
          ]
        : []),
    ],
  };
  const inner: AssemblyInstance = { ...element, type: 'Assembly', id: 'IInner', name: 'Inner', suppressed: false };
  const outer: SubAssembly = {
    ...element,
    elementId: 'c'.repeat(24),
    instances: [inner],
    features: [],
  };
  const instances = Array.from({ length: count }, (_, i) => ({
    ...(nested ? outer : element),
    id: `ILeg${i}`,
    name: `Leg ${i}`,
    type: 'Assembly',
    suppressed: false,
  }));
  const prefixOf = (i: AssemblyInstance) => (nested ? [i.id, inner.id] : [i.id]);

  root.instances = [base, ...instances];
  root.occurrences = [
    baseOccurrence,
    ...instances.flatMap((i) =>
      movingOccurrences.map((o) => ({ ...o, fixed: false, path: [...prefixOf(i), ...o.path] })),
    ),
  ];
  root.features = instances.map((i) =>
    mateFeature(i === instances[0] ? 'Melbow' : `Mhip${i.id}`, 'Hip', 'REVOLUTE', [
      { path: [base.id], origin: [0, 0, 0] },
      { path: [...prefixOf(i), thigh.id], origin: [0, 0, 0] },
    ]),
  );
  arm.definition.subAssemblies = nested ? [outer, leg] : [leg];
  arm.features = { features: [limitFeature('Melbow', 'REVOLUTE', ['-10 deg', '10 deg'])] };

  for (const sub of arm.definition.subAssemblies) {
    const query = new URLSearchParams({ configuration: sub.configuration });
    const route = `/api/v10/assemblies/d/${sub.documentId}/m/${sub.documentMicroversion}/e/${sub.elementId}/features?${query}`;

    arm.subFeatures[route] = {
      features:
        sub === leg && limits
          ? [
              limitFeature('Melbow', 'REVOLUTE', ['-60 deg', '80 deg']),
              ...(cylindrical ? [limitFeature('Maxle', 'CYLINDRICAL', ['-30 deg', '30 deg'])] : []),
            ]
          : [],
    };
  }

  return arm;
}
