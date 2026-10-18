/**
 * Catalog parts whose maker publishes a robot description (URDF / MJCF) with the joints:
 * adding one from Parts inserts that articulated model, so its fingers can be posed. Turns
 * match `rotate` in tools/parts/sources.json, so it sits like the catalog part (flange down,
 * fingers up). Parts left out stay one fixed mesh.
 */

const RAW = 'https://raw.githubusercontent.com';

export interface ArticulatedSource {
  url: string;
  rotate?: Array<[string, number]>;
  /** One color for every link, when the description carries simulation debug colors */
  color?: string;
}

export const ARTICULATED_PARTS: Record<string, ArticulatedSource> = {
  'pollen-amazing-hand': { url: `${RAW}/pollen-robotics/AmazingHand/main/Demo/AHSimulation/AHSimulation/AH_Right/mjcf/robot.xml`, rotate: [] },
  'leap-hand': { url: `${RAW}/leap-hand/LEAP_Hand_Sim/master/assets/leap_hand/robot.urdf`, rotate: [['y', -90], ['z', 90]], color: '#212124' },
  'orca-hand': { url: `${RAW}/orcahand/orcahand_description/main/v1/models/urdf/orcahand_right.urdf`, rotate: [] },
  'psyonic-ability-hand': { url: `${RAW}/psyonicinc/ability-hand-api/master/URDF/ability_hand_right_large.urdf`, rotate: [], color: '#29292e' },
  'unitree-dex3-1': { url: `${RAW}/unitreerobotics/unitree_ros/master/robots/dexterous_hand_description/dex3_1/dex3_1_r.urdf`, rotate: [['y', -90], ['z', 90]] },
  'unitree-dex5-1': { url: `${RAW}/unitreerobotics/unitree_ros/master/robots/dexterous_hand_description/dex5_1/Dex5-URDF-R/Dex5-URDF-R.urdf`, rotate: [['x', 90]] },
  'allegro-hand-v4': { url: `${RAW}/Wonikrobotics-git/allegro_hand_model_v4/main/src/allegro_hand_model/urdf/allegro_hand_r.urdf`, rotate: [['z', 90]] },
  'linker-hand-l10': { url: `${RAW}/linker-bot/linkerhand-urdf/main/L20lite/right/linkerhand_l20lite_right.urdf`, rotate: [['z', 90]] },
  'linker-hand-o6': { url: `${RAW}/linker-bot/linkerhand-urdf/main/O6/right/linkerhand_o6_right.urdf`, rotate: [['z', 90]] },
};
