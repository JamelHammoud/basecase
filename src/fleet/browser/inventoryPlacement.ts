import type { RegistryItem } from './client';

export function inventoryPlacement(robots: RegistryItem[], sites: RegistryItem[]): RegistryItem[] {
  const index = new Map(sites.map((site) => [site.id, site]));

  return robots.map((robot) => {
    const site = siteForRobot(robot, index);

    return { ...robot, registration: site?.registration, facilitySite: site?.id ?? null, facility: site?.facility };
  });
}

function siteForRobot(robot: RegistryItem, sites: Map<string, RegistryItem>) {
  if (robot.pose?.site) return sites.get(robot.pose.site);

  let site = robot.parent ? sites.get(robot.parent) : undefined;
  const direct = site;

  for (let depth = 0; site && depth < 16; depth++) {
    if (site.facility) return site;

    site = site.parent ? sites.get(site.parent) : undefined;
  }

  return direct;
}
