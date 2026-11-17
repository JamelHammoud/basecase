import { it } from 'vitest';
import { boardRoutingWalkthrough } from './boardRoutingWalkthrough';

it(
  'routes the imported rover from Board and downloads source-bound fabrication before undoing the route',
  { retry: 0 },
  () => boardRoutingWalkthrough(),
);
