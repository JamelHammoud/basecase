export interface ObjectCategory {
  title: string;
  examples: string;
  query: string;
}

export const OBJECT_CATEGORIES: ObjectCategory[] = [
  { title: 'Kitchen', examples: 'Mugs, pans, knives, cutting boards', query: 'kitchenware' },
  { title: 'Food', examples: 'Fruit, vegetables, bread, snacks', query: 'food produce' },
  { title: 'Boxes and bins', examples: 'Cardboard boxes, totes, crates', query: 'box crate bin' },
  { title: 'Bottles and jars', examples: 'Bottles, jars, cans, cups', query: 'bottle jar container' },
  { title: 'Tools', examples: 'Hammers, wrenches, screwdrivers', query: 'hand tool' },
  { title: 'Lab and medical', examples: 'Lab glassware, carts, instruments', query: 'laboratory medical equipment' },
  { title: 'Office', examples: 'Staplers, binders, desk items', query: 'office supplies' },
  { title: 'Furniture', examples: 'Tables, chairs, shelves, cabinets', query: 'furniture' },
  { title: 'Appliances', examples: 'Microwaves, ovens, washers', query: 'home appliance' },
  { title: 'Warehouse', examples: 'Pallets, racks, carts, conveyors', query: 'warehouse pallet rack' },
];
