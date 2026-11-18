import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { component, sceneOf } from '../../wiring/fixtures';
import { editableNets, routeIdentity } from '../../wiring/routeEditing';
import type { CableRoutes } from '../../workspace/useCableRoutes';
import { analyzeWiring } from '../../wiring/routeAnalysis';
import { CableRouteEditor } from './CableRouteEditor';

it('shows the authored stock policy while Automatic is resolved to actual measured stock', () => {
  const scene = sceneOf(
    [component('adapter', 'robotis-u2d2'), { ...component('servo', 'dynamixel-xl330-m288'), position: [70, 0, 0] }],
    [],
  );
  const net = editableNets(scene)[0];
  const wiring = analyzeWiring(scene, []);
  const identity = routeIdentity(net)!;
  const routes = { net, spec: undefined, anchors: [] } as unknown as CableRoutes;
  const render = (state: CableRoutes) =>
    renderToStaticMarkup(
      createElement(CableRouteEditor, {
        routes: state,
        parts: scene.parts,
        wiring,
        onShowPose: () => {},
      }),
    );

  const selected = (state: CableRoutes) => /<option[^>]*selected=""[^>]*>([^<]+)<\/option>/.exec(render(state))?.[1];

  expect(wiring.buses[0].nets[0].route?.cableSupplyId).toBe('robot-cable-x3p');
  expect(selected(routes)).toBe('Automatic');
  expect(selected({ ...routes, spec: { ...identity, supplyId: 'robot-cable-x3p' } })).toBe('ROBOTIS Robot Cable-X3P');
});
