import { describe, expect, it } from 'vitest';
import { isRobotUrl, searchBody, toAsset } from './search';

const MUG =
  'https://huggingface.co/datasets/nvidia/simready-assets/blob/653d91e182011f357cf1644013cc94ddf194d349/dishware_mug_coffee_b01/simready_usd/sm_dishware_mug_coffee_b01_01.usd';
const GRIPPER =
  'https://huggingface.co/datasets/Robotiq-Official/simready-assets/blob/e6e8380e394fcf6fec437e8c56559f9aeb8b4a27/Robotiq_2F_85/simready_usd/Robotiq_2F_85.usda';

describe('SimReady search', () => {
  it('reads a search hit into an asset with scene-ordered size, mass and a plain name', () => {
    const asset = toAsset({
      url: MUG,
      default_prims: [
        {
          bbox_dimension_x: 0.1224,
          bbox_dimension_y: 0.0889,
          bbox_dimension_z: 0.1202,
          properties: {
            simready_metadata_author: 'NVIDIA',
            simready_metadata_asset_license: 'CC-BY 4.0',
            simready_metadata_mass: '1.748',
            simready_metadata_rigid_body_count: '1',
          },
        },
      ],
      vision_generated_metadata: {
        vlm: [
          { name: 'object_type', value_text: ['coffee mug'] },
          { name: 'caption', value_text: ['White ceramic coffee mug'] },
        ],
      },
    });

    expect(asset).toMatchObject({
      name: 'Coffee mug',
      maker: 'NVIDIA',
      license: 'CC-BY 4.0',
      caption: 'White ceramic coffee mug',
      sizeMm: [122, 120, 89],
      massKg: 1.748,
      bodies: 1,
    });
    expect(asset.thumbnail).toContain(encodeURIComponent(MUG));
  });

  it('names robots by their product and keeps them off the objects shelf', () => {
    expect(toAsset({ url: GRIPPER }).name).toBe('Robotiq 2F 85');
    expect(isRobotUrl(GRIPPER)).toBe(true);
    expect(isRobotUrl(MUG)).toBe(false);
    expect(searchBody({ query: '', shelf: 'robots' })).not.toHaveProperty('hybrid_text_query');
    expect(searchBody({ query: ' mug ', shelf: 'objects', offset: 40 })).toMatchObject({
      hybrid_text_query: 'mug',
      offset: 40,
      filter_url_regexp: expect.stringContaining('nvidia'),
    });
  });
});
