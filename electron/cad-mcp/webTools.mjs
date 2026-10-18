import path from 'node:path';
import { z } from 'zod';
import { checkAgainstSkeleton, describeSkeleton, fetchSkeleton } from '../robot-skeleton.mjs';
import { findRobotDescriptionText } from './githubSearch.mjs';
import { pageImages } from './pageImages.mjs';
import { IMAGE_EXT, bridge, fail, fetchWithTimeout, text } from './shared.mjs';

export const robotSkeleton = {
  name: 'robot_skeleton',
  web: true,
  config: {
    title: 'Read robot description',
    description:
      "Reads a published robot description (URDF or MuJoCo MJCF XML, e.g. a raw.githubusercontent.com link; GitHub blob links work too) and returns the exact zero-pose skeleton in the studio frame: every joint's position (mm), axis, range and offset from its parent joint. Use it whenever an open-source robot publishes one; build the joint chain to these numbers instead of estimating. Meshes are not read: part shapes still come from the photos.",
    inputSchema: {
      url: z.string().describe('URL of the .urdf or MJCF .xml file'),
      forward: z
        .enum(['+x', '-x', '+y', '-y'])
        .optional()
        .describe('Source axis the robot faces (default +x, the ROS convention)'),
    },
  },
  handler: async ({ url, forward }) => {
    try {
      return text(describeSkeleton(await fetchSkeleton(url, forward)));
    } catch (err) {
      return fail(err);
    }
  },
};

export const findRobotDescription = {
  name: 'find_robot_description',
  web: true,
  config: {
    title: 'Find robot description',
    description:
      "Searches GitHub for a named robot's published description files (URDF, MJCF/MuJoCo XML, xacro) and returns raw URLs ready for robot_skeleton, best matches first. Call it first for any named or open-source robot: exact link lengths beat any estimate.",
    inputSchema: { name: z.string().min(2).max(80).describe('Robot name, e.g. "Berkeley Humanoid", "Reachy Mini"') },
  },
  handler: async ({ name }) => {
    try {
      return text(await findRobotDescriptionText(name));
    } catch (err) {
      return fail(err);
    }
  },
};

export const checkSkeleton = {
  name: 'check_skeleton',
  web: true,
  config: {
    title: 'Check against robot description',
    description:
      "Checks the model against a published robot description (same URL as robot_skeleton): every moving joint must sit inside some part of the model, at the zero pose. Reports joints that fall outside the model (with the nearest part and how far), and how the model's overall extents compare with the joint layout. Run it after the block-out and before you finish on any robot that publishes a URDF/MJCF.",
    inputSchema: {
      url: z.string(),
      forward: z.enum(['+x', '-x', '+y', '-y']).optional(),
      floorOffset: z
        .number()
        .optional()
        .describe(
          "Height of the lowest joint above the floor in your model, mm (default: the model's own lowest joint guess, i.e. soles below it)",
        ),
    },
  },
  handler: async ({ url, forward, floorOffset }) => {
    try {
      const sk = await fetchSkeleton(url, forward);
      const scene = await bridge('snapshot', {});
      const parts = (scene.parts || []).filter((p) => p.bounds && !p.hidden && p.role === 'solid' && !p.referenceImage);

      if (!parts.length) return text('The model has no solid parts yet.');

      return text(checkAgainstSkeleton(sk, parts, floorOffset));
    } catch (err) {
      return fail(err);
    }
  },
};

export const findImages = {
  name: 'find_images',
  web: true,
  config: {
    title: 'Find images on a page',
    description:
      'Lists the images on a web page (README, product page, docs, blog, forum post): absolute URLs with their alt text, largest first when sizes are known. ' +
      'Use it to find photos from other angles, exploded views and dimensioned drawings, then open them with view_image. WebFetch drops image links; this keeps them.',
    inputSchema: { url: z.string().url() },
  },
  handler: async ({ url }) => {
    try {
      const res = await fetchWithTimeout(url, 20000);

      if (!res.ok) return fail(`The page returned ${res.status}.`);

      const html = (await res.text()).slice(0, 3_000_000);
      const list = pageImages(html, res.url || url);

      if (!list.length) return text('No images found on that page.');

      return text(list.map(([u, i]) => `- ${u}${i.alt ? ` — ${i.alt.slice(0, 120)}` : ''}`).join('\n'));
    } catch (err) {
      return fail(err);
    }
  },
};

async function downloadImage(url) {
  const res = await fetchWithTimeout(url, 25000);

  if (!res.ok) throw new Error(`returned ${res.status}`);

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const mime = /^image\/(png|jpeg|webp|gif)$/.test(type)
    ? type
    : IMAGE_EXT[path.extname(new URL(url).pathname).toLowerCase()];

  if (!mime) throw new Error(`is ${type || 'not an image'}`);

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length > 20_000_000) throw new Error('is larger than 20 MB');

  return { mime, buf };
}

async function viewableDataUrl(url) {
  const { mime, buf } = await downloadImage(url);
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

  try {
    const small = await bridge('downscale_image', { dataUrl, maxSide: 1568 }, 20000);

    if (small?.dataUrl) return small.dataUrl;
  } catch {
    if (buf.length > 4_500_000) throw new Error('is too large to view');
  }

  return dataUrl;
}

export const viewImage = {
  name: 'view_image',
  web: true,
  config: {
    title: 'View image',
    description:
      'Downloads an image from the web (PNG, JPEG, WebP or GIF) and returns it so you can study it: product photos from other angles, renders, exploded views, dimensioned drawings, datasheet figures. ' +
      'Find URLs with find_images or WebSearch. Up to 4 per call.',
    inputSchema: { urls: z.array(z.string().url()).min(1).max(4) },
  },
  handler: async ({ urls }) => {
    const content = [];

    for (const url of urls) {
      try {
        const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(await viewableDataUrl(url));

        content.push({ type: 'text', text: url });
        content.push({ type: 'image', mimeType: m[1], data: m[2] });
      } catch (err) {
        content.push({ type: 'text', text: `${url}: couldn't open it (${String(err?.message ?? err)}).` });
      }
    }

    return { content };
  },
};
